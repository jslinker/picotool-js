#!/usr/bin/env python3
"""Emit deterministic cartridge results from the vendored Python picotool."""

from __future__ import annotations

import argparse
import ast
import base64
import io
import json
import os
import pathlib
import runpy
import struct
import sys
import tempfile
import types
import zlib


PACKAGE_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_PICOTOOL_ROOT = (PACKAGE_ROOT / "vendor" / "picotool"
                         if (PACKAGE_ROOT / "vendor" / "picotool").exists()
                         else PACKAGE_ROOT.parents[1] / "vendor" / "picotool")
PICOTOOL_ROOT = pathlib.Path(os.environ.get("PICOTOOL_ROOT", DEFAULT_PICOTOOL_ROOT))
sys.path.insert(0, str(PICOTOOL_ROOT))

try:
    from pico8.game.formatter import p8, p8png
    from pico8.lua import lua as lua_module, lexer as lexer_module
    from pico8.build import build as build_module
    from pico8.game import compress as compress_module
    from pico8 import tool as tool_module
    from pico8 import util
    from pico8.game import game as game_module
except ImportError as error:
    raise SystemExit(
        "Unable to import vendored picotool. Install its Python test dependencies "
        "or run this script in the environment used for the upstream suite.\n"
        f"Original error: {error}"
    ) from error


SCHEMA = "picotool-parity/1"
HEADER = b"pico-8 cartridge // http://www.pico-8.com\nversion 4\n"
VALID_FOOTER = (
    b"__gfx__\n" + ((b"0" * 128) + b"\n") * 128
    + b"__gff__\n" + ((b"0" * 256) + b"\n") * 2
    + b"__map__\n" + ((b"0" * 256) + b"\n") * 32
    + b"__sfx__\n" + b"0001" + (b"0" * 164) + b"\n"
    + (b"001" + (b"0" * 165) + b"\n") * 63
    + b"__music__\n" + b"00 41424344\n" * 64 + b"\n\n"
)


def fnv1a32(data: bytes) -> str:
    value = 0x811C9DC5
    for byte in data:
        value ^= byte
        value = (value * 0x01000193) & 0xFFFFFFFF
    return f"{value:08x}"


def snapshot(source: bytes, name: str, game) -> dict[str, object]:
    raw = p8._get_raw_data_from_p8_file(io.BytesIO(source), filename=name)
    sections = []
    for section_name, lines in raw.section_lines.items():
        content = b"".join(lines)
        sections.append({
            "name": section_name,
            "lineCount": len(lines),
            "byteLength": len(content),
            "fnv1a32": fnv1a32(content),
        })
    domain_memory = []
    for section_name in ("gfx", "gff", "map", "sfx", "music"):
        if section_name not in raw.section_lines:
            continue
        data = bytes(getattr(game, section_name)._data)
        domain_memory.append({
            "name": section_name,
            "byteLength": len(data),
            "fnv1a32": fnv1a32(data),
        })
    return {
        "name": name,
        "version": raw.version,
        "sectionOrder": list(raw.section_lines),
        "sections": sections,
        "domainMemory": domain_memory,
    }


def normalize_error(error: Exception) -> str:
    if isinstance(error, p8.InvalidP8HeaderError):
        return "INVALID_HEADER"
    if isinstance(error, p8.InvalidP8SectionError):
        return "INVALID_SECTION"
    raise error


def result(action) -> dict[str, object]:
    try:
        return {"status": "ok", "value": action()}
    except Exception as error:  # Normalize only expected picotool errors.
        return {"status": "error", "value": normalize_error(error)}


def formatter_result(source: bytes, name: str) -> dict[str, object]:
    def parse():
        game = p8.P8Formatter.from_file(io.BytesIO(source), filename=name, do_includes=False)
        return snapshot(source, name, game)
    return result(parse)


def png_snapshot(source: bytes, name: str) -> dict[str, object]:
    try:
        raw = p8png.get_raw_data_from_p8png_file(io.BytesIO(source), filename=name)
    except ModuleNotFoundError as error:
        if error.name != "png":
            raise
        raw = raw_png_data_without_pypng(source)
    domains = (
        ("gfx", raw.gfx),
        ("gff", raw.gfx_props),
        ("map", raw.p8map),
        ("sfx", raw.sfx),
        ("music", raw.song),
    )
    return {
        "name": name,
        "version": raw.version,
        "code": {
            "byteLength": len(raw.code),
            "codeLength": raw.code_length,
            "compressedSize": raw.compressed_size,
            "fnv1a32": fnv1a32(raw.code),
        },
        "domainMemory": [
            {"name": domain, "byteLength": len(data), "fnv1a32": fnv1a32(bytes(data))}
            for domain, data in domains
        ],
    }


def raw_png_data_without_pypng(source: bytes):
    """Supply picotool's raw values when its optional PNG transport is absent."""
    if source[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Invalid PNG signature")
    cursor, header, compressed = 8, None, bytearray()
    while cursor + 12 <= len(source):
        length = struct.unpack(">I", source[cursor:cursor + 4])[0]
        chunk_type = source[cursor + 4:cursor + 8]
        chunk = source[cursor + 8:cursor + 8 + length]
        cursor += 12 + length
        if chunk_type == b"IHDR":
            header = struct.unpack(">IIBBBBB", chunk)
        elif chunk_type == b"IDAT":
            compressed.extend(chunk)
        elif chunk_type == b"IEND":
            break
    if header is None:
        raise ValueError("PNG has no IHDR chunk")
    width, height, depth, color_type, compression, filtering, interlace = header
    if (depth, color_type, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise ValueError("Oracle fallback supports only non-interlaced 8-bit RGBA PNG files")

    packed, stride, previous, rows = zlib.decompress(bytes(compressed)), width * 4, bytearray(width * 4), []
    offset = 0
    for _ in range(height):
        filter_type, offset = packed[offset], offset + 1
        row = bytearray(packed[offset:offset + stride])
        offset += stride
        for index in range(stride):
            left = row[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 1:
                prediction = left
            elif filter_type == 2:
                prediction = above
            elif filter_type == 3:
                prediction = (left + above) // 2
            elif filter_type == 4:
                value = left + above - upper_left
                distances = (abs(value - left), abs(value - above), abs(value - upper_left))
                prediction = (left, above, upper_left)[distances.index(min(distances))]
            elif filter_type == 0:
                prediction = 0
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type}")
            row[index] = (row[index] + prediction) & 255
        rows.append(row)
        previous = row

    picodata = p8png.get_picodata_from_pngdata(width, height, rows, {"planes": 4})
    code_length, code, compressed_size = p8png.get_code_from_bytes(picodata[0x4300:0x8000], picodata[0x8000])
    return types.SimpleNamespace(
        width=width, height=height, rows=rows,
        gfx=picodata[0:0x2000],
        p8map=picodata[0x2000:0x3000],
        gfx_props=picodata[0x3000:0x3100],
        song=picodata[0x3100:0x3200],
        sfx=picodata[0x3200:0x4300],
        version=picodata[0x8000],
        code_length=code_length,
        code=code,
        compressed_size=compressed_size,
    )


def png_embed_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        raw = raw_png_data_without_pypng(base64.b64decode(scenario["png"]))
        picodata = base64.b64decode(scenario["picodata"])
        rows = p8png.get_pngdata_from_picodata(picodata, raw.rows, {"planes": 4})
        rgba = b"".join(bytes(row) for row in rows)
        extracted = bytes(p8png.get_picodata_from_pngdata(raw.width, raw.height, rows, {"planes": 4}))
        cases.append({"id": f"png-embed/{scenario['id']}", "status": "ok", "value": {
            "width": raw.width, "height": raw.height, "rgba": fnv1a32(rgba),
            "picodata": base64.b64encode(extracted[:len(picodata)]).decode("ascii")}})
    return cases


def png_formatter_result(source: bytes, name: str) -> dict[str, object]:
    return result(lambda: png_snapshot(source, name))


def conformance_cases() -> list[dict[str, object]]:
    complete = HEADER + b"__lua__\n" + VALID_FOOTER
    cases = [
        {"id": "p8/minimal", **formatter_result(complete, "minimal.p8")},
        {"id": "p8/invalid-title", **formatter_result(b"INVALID HEADER\nversion 4\n__lua__\n" + VALID_FOOTER, "invalid-title.p8")},
        {"id": "p8/invalid-version", **formatter_result(b"pico-8 cartridge // http://www.pico-8.com\nINVALID HEADER\n__lua__\n" + VALID_FOOTER, "invalid-version.p8")},
        {"id": "p8/invalid-section", **formatter_result(HEADER + b"__lua__\n\n__bad__\n\n" + VALID_FOOTER, "invalid-section.p8")},
    ]
    return cases


def section_serialization_cases(source: bytes, name: str) -> list[dict[str, object]]:
    """Capture exact bytes emitted by each memory-domain serializer."""
    game = p8.P8Formatter.from_file(io.BytesIO(source), filename=name, do_includes=False)
    return [
        {
            "id": f"section/{name}/{domain}",
            "status": "ok",
            "value": base64.b64encode(b"".join(getattr(game, domain).to_lines())).decode("ascii"),
        }
        for domain in ("gfx", "gff", "map", "sfx", "music")
    ]


def writer_case(source: bytes, name: str, minify: bool = False, format_token: bool = False,
                ast_writer: str | None = None) -> dict[str, object]:
    game = p8.P8Formatter.from_file(io.BytesIO(source), filename=name, do_includes=False)
    output = io.BytesIO()
    writer_cls = (lua_module.LuaASTEchoWriter if ast_writer == "echo" else
                  lua_module.LuaMinifyWriter if ast_writer == "minify" else
                  lua_module.LuaFormatterWriter if ast_writer == "format" else
                  lua_module.LuaFormatterTokenWriter if format_token else
                  lua_module.LuaMinifyTokenWriter if minify else None)
    p8.P8Formatter.to_file(game, output, lua_writer_cls=writer_cls)
    return {
        "id": f"{'writer-ast-' + ast_writer if ast_writer else ('writer-format-token' if format_token else ('writer-minify' if minify else 'writer'))}/{name}",
        "status": "ok",
        "value": base64.b64encode(output.getvalue()).decode("ascii"),
    }


def writer_scenarios(source: bytes) -> list[dict[str, object]]:
    variants = {
        "empty-lua": [],
        "no-final-newline": [b'print(1)'],
        "trailing-spaces": [b'print(1)  \n'],
        "p8scii-comment": [lua_module.unicode_to_p8scii('-- ♥ ★ あ ⬆️\n')],
        "numeric-escape": [b'print("a\\123")\n'],
    }
    cases = []
    for name, lines in variants.items():
        game = p8.P8Formatter.from_file(io.BytesIO(source), filename=name, do_includes=False)
        game.lua = lua_module.Lua.from_lines(lines, version=game.version)
        output = io.BytesIO()
        p8.P8Formatter.to_file(game, output)
        cases.append({"id": f"writer-scenario/{name}", "status": "ok",
                      "value": base64.b64encode(output.getvalue()).decode("ascii")})
    return cases


def lua_diagnostic_cases(scenarios: list[dict[str, str]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        name = scenario["id"]
        source = lua_module.unicode_to_p8scii(scenario["source"])
        try:
            parsed = lua_module.Lua.from_lines([source], version=8)
            chars, tokens = parsed.get_char_count(), parsed.get_token_count()
            warnings = []
            if chars > lua_module.PICO8_LUA_CHAR_LIMIT:
                warnings.append(f"warning: character count {chars} exceeds the PICO-8 limit of 65535")
            if tokens > lua_module.PICO8_LUA_TOKEN_LIMIT:
                warnings.append(f"warning: token count {tokens} exceeds the PICO-8 limit of 8192")
            value = {"characterCount": chars, "tokenCount": tokens, "warnings": warnings}
        except Exception as error:
            value = {"error": type(error).__name__, "message": str(error)}
        cases.append({"id": f"lua/{name}", "status": "ok", "value": value})
    return cases


def writer_diagnostic_cases(source: bytes, scenarios: list[dict[str, str]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        try:
            game = p8.P8Formatter.from_file(io.BytesIO(source), filename=scenario["id"], do_includes=False)
            game.lua = lua_module.Lua.from_lines([lua_module.unicode_to_p8scii(scenario["source"])], version=game.version)
            output, errors = io.BytesIO(), io.StringIO()
            original_error_stream = util._error_stream
            util._error_stream = errors
            try:
                p8.P8Formatter.to_file(game, output, filename=scenario.get("filename"))
            finally:
                util._error_stream = original_error_stream
            value = {"byteLength": len(output.getvalue()), "fnv1a32": fnv1a32(output.getvalue()),
                     "warnings": errors.getvalue().strip().splitlines() if errors.getvalue() else []}
        except Exception as error:
            value = {"error": type(error).__name__, "message": str(error)}
        cases.append({"id": f"writer-diagnostic/{scenario['id']}", "status": "ok", "value": value})
    return cases


def build_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        existing = scenario.get("existing")
        cart = p8.P8Formatter.from_file(io.BytesIO(base64.b64decode(existing)), do_includes=False) if existing else game_module.Game.make_empty_game()
        empty = game_module.Game.make_empty_game()
        for domain in ("lua", "gfx", "gff", "map", "sfx", "music"):
            source = scenario.get("sources", {}).get(domain)
            if source is not None:
                data = base64.b64decode(source["data"])
                if domain == "lua" and source["format"] == "lua":
                    value = lua_module.Lua.from_lines(io.BytesIO(data), version=game_module.DEFAULT_VERSION)
                    if source.get("files") is not None:
                        with tempfile.TemporaryDirectory(prefix="picotool-build-require-") as directory:
                            root = pathlib.Path(directory)
                            for filename, content in source["files"].items():
                                destination = root / filename
                                destination.parent.mkdir(parents=True, exist_ok=True)
                                destination.write_bytes(base64.b64decode(content))
                            package_lua = {}
                            build_module._evaluate_require(
                                value, file_path=str(root / source.get("filename", "main.lua")),
                                package_lua=package_lua, lua_path=source.get("luaPath"))
                            value = build_module._prepend_package_lua(value, package_lua)
                else:
                    value = getattr(p8.P8Formatter.from_file(io.BytesIO(data), do_includes=False), domain)
                setattr(cart, domain, value)
            elif domain in scenario.get("empty", []):
                setattr(cart, domain, getattr(empty, domain))
        output = io.BytesIO()
        writer_cls = (lua_module.LuaFormatterWriter if scenario.get("luaFormat") else
                      lua_module.LuaMinifyTokenWriter if scenario.get("luaMinify") else None)
        p8.P8Formatter.to_file(cart, output, lua_writer_cls=writer_cls,
                               lua_writer_args={"indentwidth": scenario.get("indentwidth", 2)}
                               if scenario.get("luaFormat") else None)
        cases.append({"id": f"build/{scenario['id']}", "status": "ok",
                      "value": base64.b64encode(output.getvalue()).decode("ascii")})
    return cases


def include_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    with tempfile.TemporaryDirectory(prefix="picotool-includes-") as directory:
        root = pathlib.Path(directory)
        for scenario in scenarios:
            for filename, content in scenario["files"].items():
                destination = root / filename
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(base64.b64decode(content))
            cart_path = root / scenario["main"]
            try:
                with cart_path.open("rb") as stream:
                    cart = p8.P8Formatter.from_file(stream, filename=str(cart_path), do_includes=True)
                value = {"status": "ok", "lua": base64.b64encode(b"".join(cart.lua.to_lines())).decode("ascii")}
            except Exception as error:
                value = {"status": "error", "name": type(error).__name__}
            cases.append({"id": f"include/{scenario['id']}", "status": "ok", "value": value})
    return cases


def minify_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        source = lua_module.unicode_to_p8scii(scenario["source"])
        parsed = lua_module.Lua.from_lines([source], version=8)
        output = b"".join(parsed.to_lines(writer_cls=lua_module.LuaMinifyTokenWriter,
                                          writer_args={"keep_all_names": scenario.get("keepAllNames", False)}))
        cases.append({"id": f"minify/{scenario['id']}", "status": "ok",
                      "value": base64.b64encode(output).decode("ascii")})
    return cases


def format_token_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        source = lua_module.unicode_to_p8scii(scenario["source"])
        parsed = lua_module.Lua.from_lines([source], version=8)
        output = b"".join(parsed.to_lines(writer_cls=lua_module.LuaFormatterTokenWriter,
                                          writer_args={"indentwidth": scenario.get("indentwidth", 2)}))
        cases.append({"id": f"format-token/{scenario['id']}", "status": "ok",
                      "value": base64.b64encode(output).decode("ascii")})
    return cases


def require_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    with tempfile.TemporaryDirectory(prefix="picotool-require-") as directory:
        root = pathlib.Path(directory)
        for scenario in scenarios:
            for filename, content in scenario.get("files", {}).items():
                destination = root / filename
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(base64.b64decode(content))
            source = base64.b64decode(scenario["source"])
            try:
                parsed = lua_module.Lua.from_lines([source], version=8)
                package_lua = {}
                build_module._evaluate_require(parsed, file_path=str(root / scenario.get("filename", "main.lua")),
                                               package_lua=package_lua, lua_path=scenario.get("luaPath"))
                result = build_module._prepend_package_lua(parsed, package_lua)
                value = {"bytes": base64.b64encode(b"".join(result.to_lines())).decode("ascii")}
            except Exception as error:
                value = {"error": type(error).__name__, "message": str(error)}
            cases.append({"id": f"require/{scenario['id']}", "status": "ok", "value": value})
    return cases


def ast_writer_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    writers = {"echo": lua_module.LuaASTEchoWriter,
               "minify": lua_module.LuaMinifyWriter,
               "format": lua_module.LuaFormatterWriter,
               "format-token": lua_module.LuaFormatterTokenWriter,
               "minify-token": lua_module.LuaMinifyTokenWriter}
    cases = []
    for scenario in scenarios:
        source = base64.b64decode(scenario["source"])
        for name, writer in writers.items():
            try:
                parsed = lua_module.Lua.from_lines([source], version=8)
                output = b"".join(parsed.to_lines(writer_cls=writer,
                                                   writer_args={"indentwidth": scenario["indentwidth"]}
                                                   if name in ("format", "format-token") and "indentwidth" in scenario else None))
                value = {"bytes": base64.b64encode(output).decode("ascii")}
            except Exception as error:
                value = {"error": type(error).__name__, "message": str(error)}
            cases.append({"id": f"ast-writer/{name}/{scenario['id']}", "status": "ok", "value": value})
    return cases


def ast_writer_corpus() -> list[dict[str, object]]:
    source_path = PICOTOOL_ROOT / "tests" / "pico8" / "lua" / "lua_test.py"
    namespace = runpy.run_path(str(source_path))
    scenarios = [
        {"id": name.lower().replace("valid_lua_", ""),
         "source": base64.b64encode(b"".join(namespace[name])).decode("ascii")}
        for name in ("VALID_LUA_SHORT_LINES", "VALID_LUA_EVERY_NODE")
    ]
    seen = {scenario["source"] for scenario in scenarios}
    for node in ast.walk(ast.parse(source_path.read_text())):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute) or node.func.attr != "from_lines" or not node.args:
            continue
        try:
            lines = ast.literal_eval(node.args[0])
        except (ValueError, TypeError, SyntaxError, MemoryError):
            continue
        if not isinstance(lines, list) or not all(isinstance(line, bytes) for line in lines):
            continue
        encoded = base64.b64encode(b"".join(lines)).decode("ascii")
        if encoded not in seen:
            seen.add(encoded)
            scenarios.append({"id": f"line-{node.lineno}", "source": encoded})
    cases = ast_writer_cases(scenarios)
    sources = {scenario["id"]: scenario["source"] for scenario in scenarios}
    for case in cases:
        case["source"] = sources[case["id"].split("/")[-1]]
    return cases


def pure_lua_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        source = base64.b64decode(scenario["source"])
        try:
            parsed = lua_module.Lua.from_lines([source], version=8)
            value = {"bytes": base64.b64encode(b"".join(parsed.to_lines(writer_cls=lua_module.PureLuaWriter))).decode("ascii")}
        except Exception as error:
            value = {"error": type(error).__name__, "message": str(error)}
        cases.append({"id": f"pure-lua/{scenario['id']}", "status": "ok", "value": value})
    return cases


def stats_cases(fixtures: list[pathlib.Path]) -> list[dict[str, object]]:
    cases = []
    for fixture in fixtures:
        game = p8.P8Formatter.from_file(io.BytesIO(fixture.read_bytes()), filename=fixture.name, do_includes=False)
        value = {"title": base64.b64encode(game.lua.get_title()).decode("ascii") if game.lua.get_title() is not None else None,
                 "byline": base64.b64encode(game.lua.get_byline()).decode("ascii") if game.lua.get_byline() is not None else None,
                 "version": game.lua.version, "characterCount": game.lua.get_char_count(),
                 "tokenCount": game.lua.get_token_count(), "lineCount": game.lua.get_line_count(),
                 "compressedSize": game.get_compressed_size()}
        cases.append({"id": f"stats/{fixture.name}", "status": "ok", "value": value})
    return cases


def compress_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    return [{"id": f"compress/{scenario['id']}", "status": "ok",
             "value": base64.b64encode(compress_module.compress_code(base64.b64decode(scenario["source"]))).decode("ascii")}
            for scenario in scenarios]


def listing_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    with tempfile.TemporaryDirectory(prefix="picotool-listing-") as directory:
        for scenario in scenarios:
            filename = pathlib.Path(directory) / "input.p8"
            filename.write_bytes(base64.b64decode(scenario["source"]))
            args = types.SimpleNamespace(filename=[str(filename)], pure_lua=scenario.get("pure", False),
                                         show_line_numbers=scenario.get("lineNumbers", False))
            capture = io.StringIO()
            previous = util._write_stream
            try:
                util._write_stream = capture
                if scenario.get("raw"):
                    tool_module.listrawlua(args)
                else:
                    tool_module.listlua(args)
            finally:
                util._write_stream = previous
            cases.append({"id": f"listing/{scenario['id']}", "status": "ok", "value": capture.getvalue()})
    return cases


def token_listing_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    with tempfile.TemporaryDirectory(prefix="picotool-tokens-") as directory:
        for scenario in scenarios:
            filename = pathlib.Path(directory) / "input.p8"
            filename.write_bytes(base64.b64decode(scenario["source"]))
            capture = io.StringIO()
            previous = util._write_stream
            try:
                util._write_stream = capture
                tool_module.listtokens(types.SimpleNamespace(filename=[str(filename)]))
            finally:
                util._write_stream = previous
            cases.append({"id": f"token-listing/{scenario['id']}", "status": "ok", "value": capture.getvalue()})
    return cases


def cart_memory_cases(scenarios: list[dict[str, object]]) -> list[dict[str, object]]:
    cases = []
    for scenario in scenarios:
        cart = game_module.Game.make_empty_game(version=scenario.get("version", 33))
        cart.lua = lua_module.Lua.from_lines([base64.b64decode(scenario.get("code", ""))], version=cart.version)
        try:
            cart.write_cart_data(base64.b64decode(scenario["data"]), scenario.get("start", 0))
            memory = b"".join((bytes(cart.gfx._data), bytes(cart.map._data), bytes(cart.gff._data),
                               bytes(cart.music._data), bytes(cart.sfx._data)))
            value = {"memory": fnv1a32(memory), "compressedSize": cart.get_compressed_size()}
        except Exception as error:
            value = {"error": type(error).__name__, "message": str(error)}
        cases.append({"id": f"cart-memory/{scenario['id']}", "status": "ok", "value": value})
    return cases


def parser_corpus() -> list[dict[str, object]]:
    source_path = PICOTOOL_ROOT / "tests" / "pico8" / "lua" / "parser_test.py"
    tree = ast.parse(source_path.read_text())
    cases = []
    seen = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name) or node.func.id != "get_parser" or not node.args:
            continue
        try:
            source = ast.literal_eval(node.args[0])
        except (ValueError, TypeError, SyntaxError, MemoryError):
            continue
        if not isinstance(source, bytes) or source in seen:
            continue
        seen.add(source)
        try:
            lua_module.Lua.from_lines([source], version=4)
            value = {"accepted": True}
        except Exception as error:
            value = {"accepted": False, "error": type(error).__name__, "message": str(error)}
        cases.append({"id": f"parser-corpus/{node.lineno}", "source": base64.b64encode(source).decode("ascii"),
                      "status": "ok", "value": value})
    return cases


def lexer_corpus() -> list[dict[str, object]]:
    source_path = PICOTOOL_ROOT / "tests" / "pico8" / "lua" / "lexer_test.py"
    tree = ast.parse(source_path.read_text())
    cases = []
    seen = set()
    sources = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute) or node.func.attr != "_process_line" or not node.args:
            continue
        try:
            source = ast.literal_eval(node.args[0])
        except (ValueError, TypeError, SyntaxError, MemoryError):
            continue
        if isinstance(source, bytes):
            sources.append((node.lineno, source))
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        parts = []
        for child in ast.walk(node):
            if not isinstance(child, ast.Call) or not isinstance(child.func, ast.Attribute) or child.func.attr != "_process_line" or not child.args:
                continue
            try:
                part = ast.literal_eval(child.args[0])
            except (ValueError, TypeError, SyntaxError, MemoryError):
                continue
            if isinstance(part, bytes):
                parts.append((child.lineno, part))
        if len(parts) > 1:
            sources.append((node.lineno, b"".join(part for _, part in sorted(parts))))
    for lineno, source in sources:
        if source in seen:
            continue
        seen.add(source)
        lexer = lexer_module.Lexer(version=4)
        try:
            lexer.process_lines([source])
            value = {"tokens": [{"type": type(token).__name__[3:].lower(),
                                   "value": base64.b64encode(token.code).decode("ascii"),
                                   "line": token._lineno, "column": token._charno}
                                  for token in lexer._tokens]}
        except Exception as error:
            value = {"error": type(error).__name__, "message": str(error)}
        cases.append({"id": f"lexer-corpus/{lineno}", "source": base64.b64encode(source).decode("ascii"),
                      "status": "ok", "value": value})
    return cases


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixtures", nargs="*", type=pathlib.Path, help=".p8 or .p8.png fixtures to snapshot")
    parser.add_argument("--sections", action="store_true", help="compare exact serialized memory-section bytes for text fixtures")
    parser.add_argument("--write", action="store_true", help="compare exact default .p8 writer output for text fixtures")
    parser.add_argument("--write-minify", action="store_true", help="compare exact minifying .p8 writer output for text fixtures")
    parser.add_argument("--write-format-token", action="store_true", help="compare exact token-formatted .p8 writer output")
    parser.add_argument("--write-ast-minify", action="store_true", help="compare exact AST-minified .p8 writer output")
    parser.add_argument("--write-ast-format", action="store_true", help="compare exact AST-formatted .p8 writer output")
    parser.add_argument("--write-ast-echo", action="store_true", help="compare exact AST-echoed .p8 writer output")
    parser.add_argument("--write-scenarios", action="store_true", help="compare Lua edge cases in the default writer")
    parser.add_argument("--lua-diagnostics", action="store_true", help="read Lua scenarios as JSON from stdin")
    parser.add_argument("--writer-diagnostics", type=pathlib.Path, help="read writer warning scenarios as JSON from stdin, using this base cart")
    parser.add_argument("--build-cases", action="store_true", help="read build scenarios as JSON from stdin")
    parser.add_argument("--include-cases", action="store_true", help="read include scenarios as JSON from stdin")
    parser.add_argument("--minify-cases", action="store_true", help="read Lua token minifier scenarios as JSON from stdin")
    parser.add_argument("--format-token-cases", action="store_true", help="read Lua token formatter scenarios as JSON from stdin")
    parser.add_argument("--require-cases", action="store_true", help="read Lua require scenarios as JSON from stdin")
    parser.add_argument("--ast-writer-cases", action="store_true", help="read AST writer scenarios as JSON from stdin")
    parser.add_argument("--ast-writer-corpus", action="store_true", help="evaluate upstream complete Lua writer examples")
    parser.add_argument("--pure-lua-cases", action="store_true", help="read PureLuaWriter scenarios as JSON from stdin")
    parser.add_argument("--stats", action="store_true", help="compare cartridge metadata for text fixtures")
    parser.add_argument("--compress-cases", action="store_true", help="compare exact compressed Lua bytes")
    parser.add_argument("--listing-cases", action="store_true", help="compare Lua listing command output")
    parser.add_argument("--token-listing-cases", action="store_true", help="compare token listing command output")
    parser.add_argument("--cart-memory-cases", action="store_true", help="compare Game memory writes and compressed size")
    parser.add_argument("--parser-corpus", action="store_true", help="evaluate literal upstream parser-test inputs")
    parser.add_argument("--lexer-corpus", action="store_true", help="evaluate literal upstream lexer-test lines")
    parser.add_argument("--png-embed-cases", action="store_true", help="read PNG/picodata embedding scenarios as JSON from stdin")
    args = parser.parse_args()

    if args.lua_diagnostics:
        cases = lua_diagnostic_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.writer_diagnostics:
        cases = writer_diagnostic_cases(args.writer_diagnostics.read_bytes(), json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.build_cases:
        cases = build_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.include_cases:
        cases = include_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.minify_cases:
        cases = minify_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.format_token_cases:
        cases = format_token_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.require_cases:
        cases = require_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.ast_writer_cases:
        cases = ast_writer_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.ast_writer_corpus:
        cases = ast_writer_corpus()
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.pure_lua_cases:
        cases = pure_lua_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.stats:
        cases = stats_cases(args.fixtures)
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.compress_cases:
        cases = compress_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.listing_cases:
        cases = listing_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.token_listing_cases:
        cases = token_listing_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.cart_memory_cases:
        cases = cart_memory_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.parser_corpus:
        cases = parser_corpus()
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.lexer_corpus:
        cases = lexer_corpus()
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    if args.png_embed_cases:
        cases = png_embed_cases(json.load(sys.stdin))
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return

    if args.write_scenarios:
        if len(args.fixtures) != 1:
            parser.error("--write-scenarios expects one base .p8 fixture")
        cases = writer_scenarios(args.fixtures[0].read_bytes())
        print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))
        return
    cases = [] if args.sections or args.write or args.write_minify or args.write_format_token or args.write_ast_minify or args.write_ast_format or args.write_ast_echo else conformance_cases()
    for fixture in args.fixtures:
        if args.write_ast_minify or args.write_ast_format or args.write_ast_echo:
            cases.append(writer_case(fixture.read_bytes(), fixture.name,
                                     ast_writer="minify" if args.write_ast_minify else "format" if args.write_ast_format else "echo"))
            continue
        if args.write_format_token:
            cases.append(writer_case(fixture.read_bytes(), fixture.name, format_token=True))
            continue
        if args.write_minify:
            cases.append(writer_case(fixture.read_bytes(), fixture.name, minify=True))
            continue
        if args.write:
            cases.append(writer_case(fixture.read_bytes(), fixture.name))
            continue
        if args.sections:
            cases.extend(section_serialization_cases(fixture.read_bytes(), fixture.name))
            continue
        formatter = png_formatter_result if fixture.name.lower().endswith(".p8.png") else formatter_result
        cases.append({
            "id": f"fixture/{fixture.name}",
            **formatter(fixture.read_bytes(), fixture.name),
        })
    print(json.dumps({"schema": SCHEMA, "implementation": "python-picotool", "parity": {"cases": cases}}, indent=2))


if __name__ == "__main__":
    main()
