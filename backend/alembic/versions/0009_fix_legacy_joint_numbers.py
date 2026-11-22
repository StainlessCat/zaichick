"""Migrate legacy single-digit joint numbers (1, 2, 3...) to corporate standard (010, 011, 020...).

Revision ID: 0009_fix_legacy_joint_numbers
Revises: 0008_add_login_rate_limits
Create Date: 2026-11-22 17:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_fix_legacy_joint_numbers"
down_revision: Union[str, Sequence[str], None] = "0008_add_login_rate_limits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update line 01-ГП-1.1
    op.execute(
        sa.text(
            "UPDATE weld_joints SET joint_number = '010' "
            "WHERE joint_number = '1' AND unique_line_id = 'УКПГ-1С:01-ГП:01-ГП-1.1'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE weld_joints SET joint_number = '011', is_supplementary = true "
            "WHERE joint_number = '2' AND unique_line_id = 'УКПГ-1С:01-ГП:01-ГП-1.1'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE weld_joints SET joint_number = '020' "
            "WHERE joint_number = '3' AND unique_line_id = 'УКПГ-1С:01-ГП:01-ГП-1.1'"
        )
    )

    # 2. Update line 02-ШФЛУ-2.1
    op.execute(
        sa.text(
            "UPDATE weld_joints SET joint_number = '010' "
            "WHERE joint_number = '1' AND unique_line_id = 'УКПГ-1С:02-ШФЛУ:02-ШФЛУ-2.1'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE weld_joints SET joint_number = '020' "
            "WHERE joint_number = '2' AND unique_line_id = 'УКПГ-1С:02-ШФЛУ:02-ШФЛУ-2.1'"
        )
    )

    # 3. Update line 03-МТ-108
    op.execute(
        sa.text(
            "UPDATE weld_joints SET joint_number = '010' "
            "WHERE joint_number = '1' AND unique_line_id = 'УКПГ-1С:03-МТ:03-МТ-108'"
        )
    )

    # 4. General fallback: Any remaining single-digit natural numbers (1-9) -> (010, 020, ... 090)
    op.execute(
        sa.text(
            "UPDATE weld_joints "
            "SET joint_number = '0' || (CAST(joint_number AS integer) * 10) "
            "WHERE joint_number ~ '^[1-9]$'"
        )
    )


def downgrade() -> None:
    pass
