# Elixir Documentation

This extension provides the commands:

* Elixir Documentation
* Erlang/OTP Documentation
* Elixir/Erlang documentation at cursor

that open Elixir or Erlang documentation in the built-in Simple Browser.

## Features

The `Elixir Documentation` will open up the main Elixir language documentation
[site](https://elixir-lang.org/docs.html) accordingly to your local Elixir version.

The `Erlang/OTP Documentation` will open up the main Erlang/OTP documentation
[site](https://www.erlang.org/docs) accordingly to your local OTP version.

The `Elixir/Erlang documentation at cursor` will try to parse the `module.function/arity`
at current cursor location and will try to open respective Elixir/Erlang module/function/arity
documentation page.

## Requirements

* Erlang/OTP and Elixir installation
* The `iex` executable must be in PATH.
* VSCode's [Elixir LSP extension](https://marketplace.visualstudio.com/items?itemName=JakeBecker.elixir-ls)

Specific versions of Elixir/OTP also require a respective Elixir LSP extension version:

* OTP 22.x with Elixir 1.9.x -> Elixir LSP extension: v0.7.0

## Extension Settings

This extension contributes the following settings:

* `elixir-documentation.hexdocs_base_uri`: Defaults to 'https://hexdocs.pm'.
* `elixir-documentation.erlang_base_uri`: Defaults to 'https://www.erlang.org/docs'.

## Known Issues

* Arity of function usage without default argument overrides is incorrect (without LSP)

## Release Notes

### 0.1.0

New approach: of parsing the current cursor line into tokens that then are
completed via Elixir LSP for more accurate documentation lookups.

### 0.0.1

Initial very-very basic version for local testing.

