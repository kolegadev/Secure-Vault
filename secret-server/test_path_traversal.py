#!/usr/bin/env python3
"""
Test script to verify path traversal vulnerability is fixed
"""
import sys
import os
import tempfile
sys.path.insert(0, 'src')

from secret_server.signing.agent import Signer

def test_path_traversal_protection():
    """Test that path traversal attacks are blocked"""
    print("Testing path traversal protection...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create crypto directory
        crypto_dir = os.path.join(tmpdir, "crypto")
        os.makedirs(crypto_dir)
        
        # Create a valid key file
        valid_key_path = os.path.join(crypto_dir, "valid.key")
        with open(valid_key_path, "w") as f:
            f.write("11" * 32)
        
        # Create a file outside the crypto directory
        outside_file = os.path.join(tmpdir, "secret.key")
        with open(outside_file, "w") as f:
            f.write("22" * 32)
        
        # Initialize signer
        signer = Signer(tmpdir, "crypto")
        
        # Test valid key_id - should work
        try:
            key_path = signer._key_path("valid")
            print("✓ Valid key_id 'valid' accepted")
        except Exception as e:
            print(f"✗ Valid key_id 'valid' rejected: {e}")
            return False
        
        # Test path traversal attempts - should all fail
        malicious_key_ids = [
            "../secret",          # Basic path traversal
            "..\\secret",         # Windows path traversal
            "../../secret",       # Double path traversal
            "../../../etc/passwd", # System file access attempt
            "crypto/../secret",   # Mixed legitimate/malicious path
            "valid/../secret",    # Relative path after valid component
            "..",                 # Just parent directory
            ".",                  # Current directory
            "",                   # Empty string
            "valid/../../secret", # Path traversal with subdirectory
            "valid/../../../secret", # Multiple levels
        ]
        
        for key_id in malicious_key_ids:
            try:
                signer._key_path(key_id)
                print(f"✗ Malicious key_id '{key_id}' was ACCEPTED (vulnerability!)")
                return False
            except ValueError as e:
                print(f"✓ Malicious key_id '{key_id}' correctly rejected: {e}")
            except Exception as e:
                print(f"✓ Malicious key_id '{key_id}' rejected with: {e}")
        
        # Test invalid characters - should all fail
        invalid_chars = [
            "key/with/slash",
            "key\\with\\backslash", 
            "key with space",
            "key@with$special!chars",
            "key_with_underscore",  # underscore not in whitelist
            "key.with.dots",        # dots not in whitelist
        ]
        
        for key_id in invalid_chars:
            try:
                signer._key_path(key_id)
                print(f"✗ Invalid key_id '{key_id}' was ACCEPTED (should be rejected)")
                return False
            except ValueError as e:
                print(f"✓ Invalid key_id '{key_id}' correctly rejected: {e}")
        
        # Test valid key_ids - should work
        valid_key_ids = [
            "valid-key-123",
            "mykey",
            "key123",
            "KEY-ABC",
            "a1b2c3",
            "test-key-name",
        ]
        
        for key_id in valid_key_ids:
            try:
                signer._key_path(key_id)
                print(f"✓ Valid key_id '{key_id}' accepted")
            except Exception as e:
                print(f"✗ Valid key_id '{key_id}' rejected: {e}")
                return False
    
    print("\n✅ All path traversal protection tests passed!")
    return True

if __name__ == "__main__":
    success = test_path_traversal_protection()
    sys.exit(0 if success else 1)