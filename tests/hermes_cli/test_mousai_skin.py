"""Editorial Blue — the Mousai Workspace brand skin, validated end to end.

The skin's source of truth is ``assets/skins/mousai-editorial-blue.yaml``. These
tests load it through the real skin engine (schema parse → discovery → load),
then hold it to the same palette contract as the built-in skins (completeness,
WCAG contrast floors per polarity, fill polarity, selection chip). The desktop
mirrors these palettes via ``apps/desktop/src/plugins/mousai-editorial-blue/``;
its parity with this file is enforced over in the vitest suite.
"""

from pathlib import Path

import pytest

from hermes_cli.skin_engine import list_skins, load_skin

REPO_ROOT = Path(__file__).resolve().parents[2]
SKIN_PATH = REPO_ROOT / "assets" / "skins" / "mousai-editorial-blue.yaml"
SKIN_NAME = "mousai-editorial-blue"

# Same contract as tests/hermes_cli/test_skin_palettes.py — duplicated here (a
# test module importing another test module is fragile) so the brand skin is
# audited against exactly the floors the built-ins ship with.
REQUIRED_KEYS = {
    "banner_border", "banner_title", "banner_accent", "banner_dim", "banner_text",
    "ui_accent", "ui_label", "ui_ok", "ui_error", "ui_warn",
    "prompt", "input_rule", "response_border",
    "status_bar_bg", "status_bar_text", "status_bar_strong", "status_bar_dim",
    "status_bar_good", "status_bar_warn", "status_bar_bad", "status_bar_critical",
    "session_label", "session_border",
    "completion_menu_bg", "completion_menu_current_bg", "selection_bg",
    "shell_dollar", "voice_status_bg",
}
STRONG_FG = (
    "banner_title", "banner_accent", "banner_text", "ui_accent", "ui_label",
    "ui_ok", "ui_error", "prompt", "status_bar_strong", "status_bar_good",
    "status_bar_bad", "status_bar_critical", "shell_dollar",
)
SOFT_FG = (
    "banner_dim", "banner_border", "ui_warn", "input_rule", "response_border",
    "status_bar_dim", "status_bar_warn", "session_label", "session_border",
)
ON_STATUS_BAR = ("status_bar_text", "status_bar_strong", "status_bar_dim")
FILLS = ("status_bar_bg", "completion_menu_bg", "completion_menu_current_bg", "selection_bg", "voice_status_bg")
STRONG_MIN = 3.9
SOFT_MIN = 2.8
DARK_POLE = "#101014"
CHIP_MIN = 1.15
# Schema-wide keys the palette audit's REQUIRED_KEYS intentionally excludes
# (GUI seeds, element roles, diffs, syntax): mirrors apps/shared/src/skin.ts
# SKIN_COLOR_TOKENS. Any key outside REQUIRED ∪ EXTRA is a typo.
EXTRA_SCHEMA_KEYS = {
    "background", "ui_primary", "ui_tool", "ui_thinking", "ui_text", "ui_border",
    "diff_added", "diff_removed", "diff_added_word", "diff_removed_word",
    "syntax_string", "syntax_number", "syntax_keyword", "syntax_comment",
    "completion_menu_meta_bg", "completion_menu_meta_current_bg",
}
KNOWN_KEYS = REQUIRED_KEYS | EXTRA_SCHEMA_KEYS
# The desktop converter consumes these keys (apps/desktop/src/themes/skin.ts
# pick() chains) — they are the seeds the GUI palette is derived from.
DESKTOP_SEEDS = ("background", "ui_accent", "ui_text", "ui_error", "ui_border", "banner_dim", "completion_menu_bg")


def _rgb(hex_color: str):
    h = hex_color.lstrip("#")
    assert len(h) == 6, f"not a 6-digit hex: {hex_color!r}"
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def _channel(v: float) -> float:
    c = v / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    r, g, b = _rgb(hex_color)
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


@pytest.fixture()
def skin(tmp_path, monkeypatch):
    """The Editorial Blue skin loaded through the REAL engine path.

    Installs the versioned YAML into a temp ``$HERMES_HOME/skins/`` and loads
    it via the public ``load_skin`` — the same discovery + default-merge chain
    a real install goes through — so the fixture IS a SkinConfig, not a dict.
    """
    skins_dir = tmp_path / "skins"
    skins_dir.mkdir()
    (skins_dir / f"{SKIN_NAME}.yaml").write_text(SKIN_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    parsed = load_skin(SKIN_NAME)
    assert parsed is not None, f"engine rejected {SKIN_PATH}"
    return parsed


class TestEditorialBlueSchema:
    def test_identity(self, skin):
        assert skin.name == SKIN_NAME
        assert skin.description
        # Branding carries the workspace identity, not Hermes'.
        assert skin.get_branding("agent_name") == "Mousai Workspace"
        assert skin.get_branding("prompt_symbol")
        # The editorial spinner ships real faces/verbs.
        assert skin.spinner.get("waiting_faces")
        assert skin.spinner.get("thinking_verbs")

    def test_dark_base_is_complete(self, skin):
        missing = REQUIRED_KEYS - skin.colors.keys()
        assert not missing, f"colors missing keys: {sorted(missing)}"

    def test_desktop_seeds_present_in_both_modes(self, skin):
        # The desktop GUI and its plugin mirror derive from these.
        for key in DESKTOP_SEEDS:
            assert skin.colors.get(key), f"colors.{key} missing (desktop seed)"
            assert skin.light_colors.get(key), f"light_colors.{key} missing (desktop seed)"

    def test_overlay_keys_are_known(self, skin):
        unknown = skin.light_colors.keys() - KNOWN_KEYS
        assert not unknown, f"light_colors has unknown keys: {sorted(unknown)}"

    def test_light_overlay_is_hand_tuned_not_empty(self, skin):
        # The paired block is optional upstream, but the brand skin ships a
        # real paper overlay — assert it is substantial, not a stub.
        assert len(skin.light_colors) >= 20


class TestEditorialBlueContrast:
    """The same floors the built-in palettes are held to (dark-authored base)."""

    def test_dark_base_strong_foregrounds(self, skin):
        problems = [
            f"{key}={skin.colors[key]} contrast {contrast(skin.colors[key], DARK_POLE):.2f} < {STRONG_MIN}"
            for key in STRONG_FG
            if contrast(skin.colors[key], DARK_POLE) < STRONG_MIN
        ]
        assert not problems, "\n".join(problems)

    def test_dark_base_soft_foregrounds(self, skin):
        problems = [
            f"{key}={skin.colors[key]} contrast {contrast(skin.colors[key], DARK_POLE):.2f} < {SOFT_MIN}"
            for key in SOFT_FG
            if contrast(skin.colors[key], DARK_POLE) < SOFT_MIN
        ]
        assert not problems, "\n".join(problems)

    def test_on_status_bar(self, skin):
        bg = skin.colors["status_bar_bg"]
        problems = []
        for key in ON_STATUS_BAR:
            floor = STRONG_MIN if key == "status_bar_strong" else SOFT_MIN
            ratio = contrast(skin.colors[key], bg)
            if ratio < floor:
                problems.append(f"{key}={skin.colors[key]} contrast {ratio:.2f} < {floor} vs status_bar_bg {bg}")
        assert not problems, "\n".join(problems)

    def test_dark_fills_are_dark(self, skin):
        problems = [
            f"{key}={skin.colors[key]} is a light fill (lum {luminance(skin.colors[key]):.2f})"
            for key in FILLS
            if luminance(skin.colors[key]) > 0.35
        ]
        assert not problems, "\n".join(problems)

    def test_light_fills_are_light(self, skin):
        keys = [key for key in FILLS if key in skin.light_colors]
        problems = [
            f"{key}={skin.light_colors[key]} is a dark fill (lum {luminance(skin.light_colors[key]):.2f})"
            for key in keys
            if luminance(skin.light_colors[key]) < 0.4
        ]
        assert not problems, "\n".join(problems)

    def test_selection_chip_distinguishable(self, skin):
        for label, block in (("colors", skin.colors), ("light_colors", skin.light_colors)):
            chip = contrast(block["completion_menu_current_bg"], block["completion_menu_bg"])
            assert chip >= CHIP_MIN, f"{label} chip contrast {chip:.2f} < {CHIP_MIN}"

    def test_background_polarity_buckets_correctly(self, skin):
        # The desktop buckets a skin by background luminance (< 0.4 ⇒ dark app).
        assert luminance(skin.colors["background"]) < 0.4
        assert luminance(skin.light_colors["background"]) > 0.5


class TestEditorialBlueDiscovery:
    """The skin is discoverable through the OFFICIAL user-skin path."""

    def test_install_to_hermes_home_then_list_and_load(self, skin, tmp_path, monkeypatch):
        skins_dir = tmp_path / "skins"
        skins_dir.mkdir(exist_ok=True)
        (skins_dir / f"{SKIN_NAME}.yaml").write_text(SKIN_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))

        names = {entry["name"] for entry in list_skins() if entry.get("source") == "user"}
        assert SKIN_NAME in names

        loaded = load_skin(SKIN_NAME)
        assert loaded.name == SKIN_NAME
        assert loaded.colors["ui_accent"] == skin.colors["ui_accent"]

    def test_corrupted_section_falls_back_to_default_merge(self, tmp_path, monkeypatch):
        # The engine's fail-safe: a broken SECTION (not a mapping) is dropped
        # with a warning and the skin still resolves — the dropped keys inherit
        # from the default skin instead of vanishing.
        import yaml

        data = yaml.safe_load(SKIN_PATH.read_text(encoding="utf-8"))
        data["colors"] = ["not", "a", "mapping"]
        skins_dir = tmp_path / "skins"
        skins_dir.mkdir()
        (skins_dir / f"{SKIN_NAME}.yaml").write_text(
            yaml.safe_dump(data, allow_unicode=True), encoding="utf-8"
        )
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))

        loaded = load_skin(SKIN_NAME)
        assert loaded.name == SKIN_NAME
        # The dropped keys inherited from the default skin.
        assert loaded.colors["banner_title"] == "#FFD700"
