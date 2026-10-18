"""Operator CLI to manage administrator privileges.

Usage:
    python -m backend.manage_admin promote <username>
    python -m backend.manage_admin demote <username>
    python -m backend.manage_admin list
"""

import argparse
import sys
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import UserAccount
from backend.db.session import get_engine


def promote(username: str) -> None:
    with Session(get_engine()) as session:
        user = session.scalar(
            select(UserAccount).where(UserAccount.username_key == username.casefold())
        )
        if user is None:
            print(f"Error: User '{username}' does not exist.", file=sys.stderr)
            sys.exit(1)
        if user.is_admin:
            print(f"User '{user.username}' is already an administrator.")
            return
        user.is_admin = True
        session.commit()
        print(f"Success: Promoted '{user.username}' to administrator.")


def demote(username: str) -> None:
    with Session(get_engine()) as session:
        user = session.scalar(
            select(UserAccount).where(UserAccount.username_key == username.casefold())
        )
        if user is None:
            print(f"Error: User '{username}' does not exist.", file=sys.stderr)
            sys.exit(1)
        if not user.is_admin:
            print(f"User '{user.username}' is not an administrator.")
            return
        user.is_admin = False
        session.commit()
        print(f"Success: Demoted '{user.username}' from administrator.")


def list_admins() -> None:
    with Session(get_engine()) as session:
        users = session.scalars(
            select(UserAccount).order_by(UserAccount.username_key.asc())
        ).all()
        if not users:
            print("No registered accounts found.")
            return
        print(f"{'Username':<24} {'Rating':<8} {'Admin Privileges':<16}")
        print("-" * 50)
        for u in users:
            admin_label = "YES (Admin)" if u.is_admin else "No"
            print(f"{u.username:<24} {u.rating:<8} {admin_label:<16}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    promote_parser = subparsers.add_parser("promote", help="Grant administrator privileges to a user")
    promote_parser.add_argument("username", help="Username of the registered account")

    demote_parser = subparsers.add_parser("demote", help="Revoke administrator privileges from a user")
    demote_parser.add_argument("username", help="Username of the registered account")

    subparsers.add_parser("list", help="List all users and their administrator status")

    args = parser.parse_args()
    if args.command == "promote":
        promote(args.username)
    elif args.command == "demote":
        demote(args.username)
    elif args.command == "list":
        list_admins()


if __name__ == "__main__":
    main()
