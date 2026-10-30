import subprocess


def run_git(root, *args):
    subprocess.run(["git", *args], cwd=root, capture_output=True, check=True)


def test_checks_staged_content_even_when_working_copy_is_safe(git_check, tmp_path):
    run_git(tmp_path, "init")
    path = tmp_path / ".env.example"
    key = "MYSQL_" + "PASSWORD="
    path.write_text(key + "accidental-sensitive-value\n", encoding="utf-8")
    run_git(tmp_path, "add", ".env.example")
    path.write_text(key + "replace_me\n", encoding="utf-8")
    count, findings = git_check.check(tmp_path, staged=True)
    assert count == 1
    assert findings == [(".env.example", "non-placeholder credential assignment")]
    assert "accidental-sensitive-value" not in str(findings)


def test_blocks_env_and_cache_files_even_if_force_added(git_check, tmp_path):
    run_git(tmp_path, "init")
    (tmp_path / "api").mkdir()
    (tmp_path / "api" / ".env").write_text("local config", encoding="utf-8")
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "main.pyc").write_bytes(b"generated")
    run_git(tmp_path, "add", ".")
    _, findings = git_check.check(tmp_path, staged=True)
    assert {name for name, _ in findings} == {"api/.env", "__pycache__/main.pyc"}


def test_placeholder_example_and_schema_can_be_committed(git_check, tmp_path):
    run_git(tmp_path, "init")
    (tmp_path / ".env.example").write_text("MYSQL_" + "PASSWORD=replace_me\n", encoding="utf-8")
    (tmp_path / "schema.sql").write_text("CREATE TABLE example(id INT);\n", encoding="utf-8")
    run_git(tmp_path, "add", ".")
    assert git_check.check(tmp_path, staged=True) == (2, [])
