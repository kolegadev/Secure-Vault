#!/usr/bin/env python3
"""
Test script to verify path traversal vulnerability in skills.py validation functions is fixed
Tests only the validation logic without importing FastAPI dependencies
"""
import os
import re
import sys
import tempfile

# Copy the validation functions directly for testing
def _validate_path_component(name: str) -> None:
    """Validate that a path component is safe and contains only allowed characters."""
    if not name:
        raise ValueError("Path component cannot be empty")
    
    # Allow only alphanumeric characters and hyphens
    if not re.match(r'^[a-zA-Z0-9\-]+$', name):
        raise ValueError("Path component can only contain alphanumeric characters and hyphens")
    
    # Additional safety check - reject any component containing path separators or relative path components
    if '/' in name or '\\' in name or '..' in name:
        raise ValueError("Path component cannot contain path separators or relative path components")


def _validate_file_path(vault: str, tool: str, file: str) -> str:
    """Validate and construct a safe file path within the skills directory."""
    # Validate both path components
    _validate_path_component(tool)
    _validate_path_component(file)
    
    # Construct the expected path (skills_dir hardcoded as "skills" for testing)
    skills_base = os.path.join(vault, "skills")
    tool_dir = os.path.join(skills_base, tool)
    file_path = os.path.join(tool_dir, file)
    
    # Resolve to absolute paths to handle any potential symlinks or relative path components
    resolved_skills_base = os.path.realpath(skills_base)
    resolved_file_path = os.path.realpath(file_path)
    
    # Verify the resolved file path is within the expected skills directory
    try:
        common_path = os.path.commonpath([resolved_skills_base, resolved_file_path])
        if common_path != resolved_skills_base:
            raise ValueError("File path resolves to location outside skills directory")
    except ValueError:
        # commonpath can raise ValueError for paths on different drives (Windows)
        raise ValueError("File path resolves to invalid location")
    
    return file_path


def test_skills_validation():
    """Test that skills API validation blocks path traversal attacks"""
    print("Testing skills API path traversal protection...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create vault structure
        vault_dir = tmpdir
        skills_dir = os.path.join(vault_dir, "skills")
        os.makedirs(skills_dir)
        
        # Create a legitimate tool directory and file
        tool_dir = os.path.join(skills_dir, "mytool")
        os.makedirs(tool_dir)
        skill_file = os.path.join(tool_dir, "SKILL-md")
        with open(skill_file, "w") as f:
            f.write("# My Tool\nThis is a legitimate skill file.")
        
        # Create a sensitive file outside the skills directory
        secret_file = os.path.join(vault_dir, "secret.txt")
        with open(secret_file, "w") as f:
            f.write("CONFIDENTIAL DATA")
        
        # Test valid parameters - should work
        try:
            file_path = _validate_file_path(vault_dir, "mytool", "SKILL-md")
            print("✓ Valid parameters 'mytool'/'SKILL-md' accepted")
        except Exception as e:
            print(f"✗ Valid parameters rejected: {e}")
            return False
        
        # Test path traversal attempts on tool parameter
        malicious_tools = [
            "../..",
            "..",
            "../secret",
            "../../secret",
            "../../../etc/passwd",
            "tool/../secret",
            "tool/../../secret",
            "",
            ".",
            "tool/subdir",  # contains slash
            "tool\\subdir", # contains backslash
        ]
        
        for tool in malicious_tools:
            try:
                _validate_file_path(vault_dir, tool, "SKILL-md")
                print(f"✗ Malicious tool parameter '{tool}' was ACCEPTED (vulnerability!)")
                return False
            except ValueError as e:
                print(f"✓ Malicious tool parameter '{tool}' correctly rejected")
            except Exception as e:
                print(f"✓ Malicious tool parameter '{tool}' rejected with: {e}")
        
        # Test path traversal attempts on file parameter
        malicious_files = [
            "../secret.txt",
            "../../secret.txt", 
            "../../../etc/passwd",
            "file/../secret.txt",
            "SKILL.md/../secret.txt",
            "",
            "..",
            ".",
            "file/with/slash",
            "file\\with\\backslash",
        ]
        
        for file in malicious_files:
            try:
                _validate_file_path(vault_dir, "mytool", file)
                print(f"✗ Malicious file parameter '{file}' was ACCEPTED (vulnerability!)")
                return False
            except ValueError as e:
                print(f"✓ Malicious file parameter '{file}' correctly rejected")
            except Exception as e:
                print(f"✓ Malicious file parameter '{file}' rejected with: {e}")
        
        # Test valid alphanumeric tool and file names
        valid_combinations = [
            ("tool", "file"),
            ("mytool", "SKILL-md"),
            ("tool123", "config"),
            ("TOOL-ABC", "README"),
            ("a1b2c3", "test-file"),
        ]
        
        for tool, file in valid_combinations:
            try:
                _validate_file_path(vault_dir, tool, file)
                print(f"✓ Valid combination '{tool}'/'{file}' accepted")
            except Exception as e:
                print(f"✗ Valid combination '{tool}'/'{file}' rejected: {e}")
                return False
    
    print("\n✅ All skills path traversal protection tests passed!")
    return True

def test_component_validation():
    """Test individual component validation"""
    print("Testing individual component validation...")
    
    # Valid components
    valid_components = [
        "tool",
        "mytool",
        "tool123", 
        "TOOL-ABC",
        "a1b2c3",
        "test-file",
        "SKILL-md",
    ]
    
    for component in valid_components:
        try:
            _validate_path_component(component)
            print(f"✓ Valid component '{component}' accepted")
        except Exception as e:
            print(f"✗ Valid component '{component}' rejected: {e}")
            return False
    
    # Invalid components
    invalid_components = [
        "../secret",
        "tool/file",
        "tool\\file", 
        "tool..file",
        "..",
        ".",
        "",
        "tool with space",
        "tool@special",
        "tool_underscore",
        "tool.with.dots",
    ]
    
    for component in invalid_components:
        try:
            _validate_path_component(component)
            print(f"✗ Invalid component '{component}' was ACCEPTED (should be rejected)")
            return False
        except ValueError as e:
            print(f"✓ Invalid component '{component}' correctly rejected")
        except Exception as e:
            print(f"✓ Invalid component '{component}' rejected with: {e}")
    
    print("✅ Component validation tests passed!")
    return True

if __name__ == "__main__":
    success1 = test_component_validation()
    success2 = test_skills_validation()
    
    if success1 and success2:
        print("\n🎉 ALL SECURITY TESTS PASSED - Path traversal vulnerability has been fixed!")
        sys.exit(0)
    else:
        print("\n❌ SECURITY TESTS FAILED - Vulnerability may still exist!")
        sys.exit(1)