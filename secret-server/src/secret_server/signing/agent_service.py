import asyncio
import json
import os
import signal

from secret_server.config import settings
from secret_server.signing.agent import Signer
from secret_server.vault.guard import is_vault_mounted


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        line = await asyncio.wait_for(reader.readline(), timeout=10.0)
        if not line:
            return

        request = json.loads(line.decode())
        key_id_raw = request.get("key_id", "")
        payload_hash = request.get("payload_hash", "")

        if not key_id_raw or not payload_hash:
            response = {"error": "key_id and payload_hash are required"}
            writer.write(json.dumps(response).encode() + b"\n")
            await writer.drain()
            return

        key_id = os.path.basename(key_id_raw)
        if not key_id:
            response = {"error": "invalid key_id"}
            writer.write(json.dumps(response).encode() + b"\n")
            await writer.drain()
            return

        if not is_vault_mounted():
            response = {"error": "Vault not mounted"}
            writer.write(json.dumps(response).encode() + b"\n")
            await writer.drain()
            return

        signer = Signer(settings.vault_mount_point, settings.crypto_dir)
        signature = signer.sign(key_id, payload_hash)
        response = {"signature": signature, "signer": key_id}
        writer.write(json.dumps(response).encode() + b"\n")
        await writer.drain()

    except json.JSONDecodeError:
        writer.write(b'{"error": "Invalid JSON"}\n')
        await writer.drain()
    except FileNotFoundError as exc:
        writer.write(json.dumps({"error": str(exc)}).encode() + b"\n")
        await writer.drain()
    except Exception as exc:
        writer.write(json.dumps({"error": f"Signing failed: {exc}"}).encode() + b"\n")
        await writer.drain()
    finally:
        writer.close()
        await writer.wait_closed()


async def main() -> None:
    socket_path = settings.signing_agent_socket

    parent = os.path.dirname(socket_path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)

    if os.path.exists(socket_path):
        os.unlink(socket_path)

    server = await asyncio.start_unix_server(handle_client, path=socket_path)
    os.chmod(socket_path, 0o600)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, server.close)

    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
