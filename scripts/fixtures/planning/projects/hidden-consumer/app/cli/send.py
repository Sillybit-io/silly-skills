"""Command-line client that posts a message through the API router."""
import sys

from app.api.server import dispatch


def main(argv):
    response = dispatch("/messages", {"client": argv[0] if argv else "cli"})
    print(response["status"])
    return 0 if response["status"] == 200 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
