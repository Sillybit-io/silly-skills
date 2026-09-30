"""Prints a greeting."""
import sys

from greet import greet


def main(argv):
    print(greet(argv[0] if argv else "world"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
