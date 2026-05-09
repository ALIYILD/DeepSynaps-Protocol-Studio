"""Pin invariants on Alembic migration modules.

Loads migration files dynamically via importlib (filenames are not valid
Python identifiers) and asserts the structural contract every migration must
satisfy:

  - ``revision`` attribute is a non-empty string.
  - ``down_revision`` attribute is present (string, tuple, or None).
  - ``upgrade`` is a callable.
  - ``downgrade`` is a callable.

For a curated set of the 10 most recent / most semantically significant
migrations we also pin the *forward schema operation* so a careless refactor
cannot silently change the DDL that lands in production.
"""
from __future__ import annotations

import importlib.util
import inspect
import types
from pathlib import Path
from typing import Any
from unittest import mock

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VERSIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _load_migration(filename: str) -> types.ModuleType:
    """Load a migration module by bare filename (e.g. '099_widen_audit_event_columns.py')."""
    path = VERSIONS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Migration not found: {path}")
    spec = importlib.util.spec_from_file_location(f"_migration_{filename[:-3]}", path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# ---------------------------------------------------------------------------
# Parametrised structural invariants — 10 most recent migrations
# ---------------------------------------------------------------------------

RECENT_MIGRATIONS = [
    "099_widen_audit_event_columns.py",
    "098_medical_image_assets.py",
    "097_agent_hires.py",
    "096_merge_dual_094_resolution.py",
    "095_merge_mri_demo_and_qeeg_heads.py",
    "094_add_mri_analysis_demo_mode.py",
    "093_qeeg_105_jobs_audit_cache.py",
    "092_merge_eeg_studio_and_parallel_heads.py",
    "091_eeg_studio_database.py",
    "090_merge_release_heads_for_fly_deploy.py",
]


@pytest.mark.parametrize("filename", RECENT_MIGRATIONS)
class TestMigrationInvariants:
    """Every migration must expose the four required symbols."""

    def test_revision_is_nonempty_string(self, filename: str) -> None:
        mod = _load_migration(filename)
        rev = getattr(mod, "revision", None)
        assert isinstance(rev, str), (
            f"{filename}: 'revision' must be a str, got {type(rev)}"
        )
        assert rev.strip(), f"{filename}: 'revision' must not be empty"

    def test_down_revision_attribute_present(self, filename: str) -> None:
        mod = _load_migration(filename)
        assert hasattr(mod, "down_revision"), (
            f"{filename}: 'down_revision' attribute is missing"
        )

    def test_down_revision_is_valid_type(self, filename: str) -> None:
        mod = _load_migration(filename)
        dr = mod.down_revision
        assert dr is None or isinstance(dr, (str, tuple)), (
            f"{filename}: 'down_revision' must be None, str, or tuple; got {type(dr)}"
        )

    def test_upgrade_is_callable(self, filename: str) -> None:
        mod = _load_migration(filename)
        fn = getattr(mod, "upgrade", None)
        assert callable(fn), (
            f"{filename}: 'upgrade' must be a callable function, got {type(fn)}"
        )

    def test_downgrade_is_callable(self, filename: str) -> None:
        mod = _load_migration(filename)
        fn = getattr(mod, "downgrade", None)
        assert callable(fn), (
            f"{filename}: 'downgrade' must be a callable function, got {type(fn)}"
        )

    def test_upgrade_takes_no_required_args(self, filename: str) -> None:
        """upgrade() must be callable with zero arguments (alembic calls it bare)."""
        mod = _load_migration(filename)
        sig = inspect.signature(mod.upgrade)
        required_params = [
            p for p in sig.parameters.values()
            if p.default is inspect.Parameter.empty
            and p.kind not in (
                inspect.Parameter.VAR_POSITIONAL,
                inspect.Parameter.VAR_KEYWORD,
            )
        ]
        assert not required_params, (
            f"{filename}: upgrade() has required params: {required_params}"
        )

    def test_downgrade_takes_no_required_args(self, filename: str) -> None:
        """downgrade() must be callable with zero arguments."""
        mod = _load_migration(filename)
        sig = inspect.signature(mod.downgrade)
        required_params = [
            p for p in sig.parameters.values()
            if p.default is inspect.Parameter.empty
            and p.kind not in (
                inspect.Parameter.VAR_POSITIONAL,
                inspect.Parameter.VAR_KEYWORD,
            )
        ]
        assert not required_params, (
            f"{filename}: downgrade() has required params: {required_params}"
        )


# ---------------------------------------------------------------------------
# Per-migration forward-operation pins (semantic DDL contracts)
# ---------------------------------------------------------------------------


def _mock_op_context() -> Any:
    """Return a mock that captures calls to alembic.op and sqlalchemy.sa."""
    mock_op = mock.MagicMock(name="op")
    # op.get_bind() -> mock engine with .dialect.name == "sqlite"
    mock_bind = mock.MagicMock()
    mock_bind.dialect.name = "sqlite"
    mock_op.get_bind.return_value = mock_bind
    # batch_alter_table returns a context manager that yields a mock
    batch_ctx = mock.MagicMock()
    mock_op.batch_alter_table.return_value.__enter__ = mock.Mock(return_value=batch_ctx)
    mock_op.batch_alter_table.return_value.__exit__ = mock.Mock(return_value=False)
    return mock_op


class TestMigration099WidenAuditEventColumns:
    """099 widens audit_events.event_id and .action on Postgres; skips SQLite."""

    def _load(self):
        return _load_migration("099_widen_audit_event_columns.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "099_widen_audit_event_columns"

    def test_down_revision_points_to_098(self) -> None:
        mod = self._load()
        assert mod.down_revision == "098_medical_image_assets"

    def test_upgrade_skips_non_postgres(self) -> None:
        """On SQLite the upgrade must be a no-op (no alter_column calls)."""
        mod = self._load()
        mock_op = _mock_op_context()
        mock_op.get_bind.return_value.dialect.name = "sqlite"

        with mock.patch.object(mod, "op", mock_op):
            mod.upgrade()

        mock_op.alter_column.assert_not_called()

    def test_downgrade_skips_non_postgres(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_op.get_bind.return_value.dialect.name = "sqlite"

        with mock.patch.object(mod, "op", mock_op):
            mod.downgrade()

        mock_op.alter_column.assert_not_called()

    def test_upgrade_calls_alter_column_twice_on_postgres(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_op.get_bind.return_value.dialect.name = "postgresql"

        with mock.patch.object(mod, "op", mock_op):
            mod.upgrade()

        assert mock_op.alter_column.call_count == 2
        # Both calls must target audit_events
        for call in mock_op.alter_column.call_args_list:
            assert call.args[0] == "audit_events"


class TestMigration098MedicalImageAssets:
    """098 creates the medical_image_assets table with expected column set."""

    def _load(self):
        return _load_migration("098_medical_image_assets.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "098_medical_image_assets"

    def test_down_revision_points_to_097(self) -> None:
        mod = self._load()
        assert mod.down_revision == "097_agent_hires"

    def test_upgrade_creates_medical_image_assets_table(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        # Simulate table does NOT yet exist → _has_table returns False
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = []
        mock_op.get_bind.return_value = mock.MagicMock()

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.upgrade()

        # create_table must be called with the canonical table name
        table_names = [
            call.args[0] for call in mock_op.create_table.call_args_list
        ]
        assert "medical_image_assets" in table_names

    def test_downgrade_drops_table_when_present(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = ["medical_image_assets"]

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.downgrade()

        mock_op.drop_table.assert_called_with("medical_image_assets")


class TestMigration097AgentHires:
    """097 creates agent_hires with unique constraint actor_id + agent_id."""

    def _load(self):
        return _load_migration("097_agent_hires.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "097_agent_hires"

    def test_down_revision_points_to_01ee9cbee8d6(self) -> None:
        mod = self._load()
        assert mod.down_revision == "01ee9cbee8d6"

    def test_upgrade_creates_agent_hires(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = []

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.upgrade()

        table_names = [
            call.args[0] for call in mock_op.create_table.call_args_list
        ]
        assert "agent_hires" in table_names

    def test_downgrade_drops_indexes_then_table(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = ["agent_hires"]
        drop_calls: list[str] = []
        mock_op.drop_index.side_effect = lambda name, **kw: drop_calls.append(name)

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.downgrade()

        assert "ix_agent_hires_agent_id" in drop_calls
        assert "ix_agent_hires_actor_id" in drop_calls
        assert "ix_agent_hires_clinic_id" in drop_calls
        mock_op.drop_table.assert_called_with("agent_hires")


class TestMigration096MergeDual094:
    """096 is a no-op merge; upgrade/downgrade must be no-ops."""

    def _load(self):
        return _load_migration("096_merge_dual_094_resolution.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "096_merge_dual_094_resolution"

    def test_down_revision_is_tuple_of_two_parents(self) -> None:
        mod = self._load()
        assert isinstance(mod.down_revision, tuple)
        assert len(mod.down_revision) == 2

    def test_upgrade_is_passthrough(self) -> None:
        mod = self._load()
        # No-op — must not raise and must not call any DDL
        mock_op = _mock_op_context()
        with mock.patch.object(mod, "op", mock_op, create=True):
            result = mod.upgrade()
        assert result is None

    def test_downgrade_is_passthrough(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        with mock.patch.object(mod, "op", mock_op, create=True):
            result = mod.downgrade()
        assert result is None


class TestMigration094AddMriDemoMode:
    """094 adds a single nullable Boolean column to mri_analyses."""

    def _load(self):
        return _load_migration("094_add_mri_analysis_demo_mode.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "094_add_mri_analysis_demo_mode"

    def test_down_revision_points_to_093(self) -> None:
        mod = self._load()
        assert mod.down_revision == "093_qeeg_105_jobs_audit_cache"

    def test_upgrade_adds_demo_mode_column(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()

        with mock.patch.object(mod, "op", mock_op):
            mod.upgrade()

        mock_op.add_column.assert_called_once()
        table_arg = mock_op.add_column.call_args.args[0]
        assert table_arg == "mri_analyses"

    def test_downgrade_drops_demo_mode_column(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()

        with mock.patch.object(mod, "op", mock_op):
            mod.downgrade()

        mock_op.drop_column.assert_called_once_with("mri_analyses", "demo_mode")


class TestMigration093QeegJobsAuditCache:
    """093 creates three tables: qeeg_analysis_jobs, qeeg_analysis_audit, qeeg_analysis_definitions_cache."""

    def _load(self):
        return _load_migration("093_qeeg_105_jobs_audit_cache.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "093_qeeg_105_jobs_audit_cache"

    def test_down_revision_points_to_092(self) -> None:
        mod = self._load()
        assert mod.down_revision == "092_merge_eeg_studio_and_parallel_heads"

    def test_upgrade_creates_three_tables(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()

        with mock.patch.object(mod, "op", mock_op):
            mod.upgrade()

        created = {call.args[0] for call in mock_op.create_table.call_args_list}
        assert "qeeg_analysis_jobs" in created
        assert "qeeg_analysis_audit" in created
        assert "qeeg_analysis_definitions_cache" in created

    def test_downgrade_drops_all_three_tables(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()

        with mock.patch.object(mod, "op", mock_op):
            mod.downgrade()

        dropped = {call.args[0] for call in mock_op.drop_table.call_args_list}
        assert "qeeg_analysis_jobs" in dropped
        assert "qeeg_analysis_audit" in dropped
        assert "qeeg_analysis_definitions_cache" in dropped


class TestMigration091EegStudioDatabase:
    """091 adds eeg_studio_profile_json column to patients + 3 new tables."""

    def _load(self):
        return _load_migration("091_eeg_studio_database.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "091_eeg_studio_database"

    def test_down_revision_points_to_090(self) -> None:
        mod = self._load()
        assert mod.down_revision == "090_merge_release_heads_for_fly_deploy"

    def test_upgrade_creates_eeg_studio_recordings(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_bind = mock.MagicMock()
        mock_op.get_bind.return_value = mock_bind
        mock_inspect = mock.MagicMock()
        # Simulate nothing exists yet
        mock_inspect.get_table_names.return_value = []
        mock_inspect.get_columns.return_value = []
        # batch context manager
        batch_ctx = mock.MagicMock()
        mock_op.batch_alter_table.return_value.__enter__ = mock.Mock(return_value=batch_ctx)
        mock_op.batch_alter_table.return_value.__exit__ = mock.Mock(return_value=False)

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.upgrade()

        created = {call.args[0] for call in mock_op.create_table.call_args_list}
        assert "eeg_studio_recordings" in created
        assert "eeg_studio_derivatives" in created
        assert "eeg_studio_profile_revisions" in created


class TestMigration090MergeReleaseHeads:
    """090 is a multi-head merge — down_revision is a tuple, both fn bodies are pass."""

    def _load(self):
        return _load_migration("090_merge_release_heads_for_fly_deploy.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "090_merge_release_heads_for_fly_deploy"

    def test_down_revision_is_tuple_of_four(self) -> None:
        mod = self._load()
        assert isinstance(mod.down_revision, tuple)
        assert len(mod.down_revision) == 4

    def test_upgrade_is_noop(self) -> None:
        mod = self._load()
        result = mod.upgrade()
        assert result is None

    def test_downgrade_is_noop(self) -> None:
        mod = self._load()
        result = mod.downgrade()
        assert result is None


class TestMigration063AddDeeptwinPersistence:
    """063 creates the three deeptwin tables referenced by the worker."""

    def _load(self):
        return _load_migration("063_add_deeptwin_persistence.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "063_add_deeptwin_persistence"

    def test_down_revision_points_to_062(self) -> None:
        mod = self._load()
        assert mod.down_revision == "062_merge_061_heads"

    def test_upgrade_creates_deeptwin_analysis_runs(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_bind = mock.MagicMock()
        mock_op.get_bind.return_value = mock_bind
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = []

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.upgrade()

        created = {call.args[0] for call in mock_op.create_table.call_args_list}
        assert "deeptwin_analysis_runs" in created
        assert "deeptwin_simulation_runs" in created
        assert "deeptwin_clinician_notes" in created

    def test_downgrade_drops_deeptwin_tables(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_bind = mock.MagicMock()
        mock_op.get_bind.return_value = mock_bind
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = [
            "deeptwin_analysis_runs",
            "deeptwin_simulation_runs",
            "deeptwin_clinician_notes",
        ]

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.downgrade()

        dropped = {call.args[0] for call in mock_op.drop_table.call_args_list}
        assert "deeptwin_analysis_runs" in dropped
        assert "deeptwin_simulation_runs" in dropped
        assert "deeptwin_clinician_notes" in dropped


class TestMigration058QeegRawWorkbench:
    """058 creates three cleaning workbench tables."""

    def _load(self):
        return _load_migration("058_qeeg_raw_workbench.py")

    def test_revision_value(self) -> None:
        mod = self._load()
        assert mod.revision == "058_qeeg_raw_workbench"

    def test_down_revision_points_to_057(self) -> None:
        mod = self._load()
        assert mod.down_revision == "057_merge_056_heads"

    def test_upgrade_creates_workbench_tables(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_bind = mock.MagicMock()
        mock_op.get_bind.return_value = mock_bind
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = []

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.upgrade()

        created = {call.args[0] for call in mock_op.create_table.call_args_list}
        assert "qeeg_cleaning_versions" in created
        assert "qeeg_cleaning_annotations" in created
        assert "qeeg_cleaning_audit_events" in created

    def test_downgrade_drops_workbench_tables(self) -> None:
        mod = self._load()
        mock_op = _mock_op_context()
        mock_bind = mock.MagicMock()
        mock_op.get_bind.return_value = mock_bind
        mock_inspect = mock.MagicMock()
        mock_inspect.get_table_names.return_value = [
            "qeeg_cleaning_versions",
            "qeeg_cleaning_annotations",
            "qeeg_cleaning_audit_events",
        ]

        import sqlalchemy as sa  # noqa: PLC0415

        with (
            mock.patch.object(mod, "op", mock_op),
            mock.patch.object(sa, "inspect", return_value=mock_inspect),
        ):
            mod.downgrade()

        dropped = {call.args[0] for call in mock_op.drop_table.call_args_list}
        assert "qeeg_cleaning_audit_events" in dropped
        assert "qeeg_cleaning_annotations" in dropped
        assert "qeeg_cleaning_versions" in dropped
