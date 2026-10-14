"""Compatibility shim for legacy pip/bench installs.

PEP 621 project metadata is owned by pyproject.toml; avoid importing
frappe_er_generator during isolated editable builds.
"""
from setuptools import setup

setup()
