# Elixir Documentation

This extension provides to commands:

* Elixir Documentation
* Elixir documentation at cursor

that open Elixir documentation in the built-in Simple Browser.

## Features

The `Elixir Documentation` will open up the main Elixir language documentation
[site](https://elixir-lang.org/docs.html) accordingly to your local Elixir version.

The `Elixir documentation at cursor` will try to parse the `module.function/arity`
at current cursor location and open the respective `hexdocs.pm` page e.g.
[def/2](https://hexdocs.pm/elixir/1.15.7/Kernel.html#def/2).

## Requirements

The `iex` executable must be in PATH.

## Extension Settings

This extension contributes the following settings:

* `elixir-documentation-lookup.hexdocs_base_uri`: Defaults to 'https://hexdocs.pm'.

## Known Issues

## Release Notes

### 0.0.1

Initial very-very basic version for local testing.
