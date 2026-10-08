#!/usr/bin/env python3
"""Patch the pinned MIT-licensed Catrooms source for AIDORU's Android build."""
from pathlib import Path
import sys

root = Path(sys.argv[1])


def replace_once(path: Path, old: str, new: str, description: str) -> str:
    source = path.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match for {description}, found {count} in {path}")
    updated = source.replace(old, new, 1)
    path.write_text(updated)
    return updated


main = root / "main.c"
source = replace_once(
    main,
    "GLFWwindow* wnd;\nuint winw=1024, winh=768, ks[4]={0};\n",
    "GLFWwindow* wnd;\nuint winw=1024, winh=768, ks[4]={0};\n#ifdef WEB\nEMSCRIPTEN_KEEPALIVE void catrooms_set_key(int direction, int pressed)\n{\n    if(direction >= 0 && direction < 4){ks[direction] = pressed ? 1 : 0;}\n}\n#endif\n",
    "add touch-button input bridge",
)
source = replace_once(
    main,
    "    if(lock_mouse == 0){return;}\n",
    "#ifndef WEB\n    if(lock_mouse == 0){return;}\n#endif\n",
    "allow keyboard controls without pointer lock in browser",
)
start = "    // camera\n"
end = "//*************************************\n// render\n"
if source.count(start) != 1 or source.count(end) != 1:
    raise SystemExit("Expected exactly one camera section in the pinned Catrooms source")
left = source.index(start)
right = source.index(end, left)
camera = """    // camera
#ifdef WEB
    // Keep a fixed bird's-eye view so the maze is readable on touch screens.
    mIdent(&view);
    mTranslate(&view, px, py, -12.f);
#else
    if(lock_mouse == 1 || istouch == 1)
    {
        xrot += ((float)((lx-mx)*sens)), lx = mx;
    }
    mIdent(&view);
    if(caught != 0.f)
    {
        const float dc = caught-t;
        mRotate(&view, 0.f, 1.f, 0.f, 0.f);
        mRotate(&view, xrot, 0.f, 0.f, 1.f);
        mTranslate(&view, px, py, -3.5f-(6.f-dc));
        if(dc < 0.f){resetGame(1);}
    }
    else
    {
        mRotate(&view, d2PI, 1.f, 0.f, 0.f);
        mRotate(&view, xrot, 0.f, 0.f, 1.f);
        mTranslate(&view, px, py, -0.5f);
    }
#endif

    // get look dir/axes
    mGetViewZ(&lookz, view);
    mGetViewX(&lookx, view);
#ifdef WEB
    // W/up moves toward positive map Y; A/left moves toward negative X.
    lookx = (vec){1.f, 0.f, 0.f};
    lookz = (vec){0.f, -1.f, 0.f};
#endif

"""
source = source[:left] + camera + source[right:]
main.write_text(source)
shell = root / "t.html"
html = replace_once(
    shell,
    """<link rel="manifest" href='data:application/manifest+json,{"display":"standalone","orientation":"landscape"}'>""",
    """<link rel="manifest" href='data:application/manifest+json,{"display":"standalone","orientation":"any"}'>""",
    "allow portrait and landscape orientation",
)
html = replace_once(
    shell,
    """    canvas { border: 0px none; outline: none; background-color: black; }
    * { margin:0; padding:0; }
    html, body { width:100%; height:100%; overflow:hidden; background-color:#000; }""",
    """    canvas { display:block; width:100%; height:100%; border:0; outline:0; background:#000; touch-action:none; }
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; overflow:hidden; background:#000; touch-action:none; }
    #touch-controls { position:fixed; z-index:10; left:max(12px, env(safe-area-inset-left)); bottom:max(12px, env(safe-area-inset-bottom)); display:none; grid-template-columns:repeat(3,54px); grid-template-rows:repeat(2,54px); gap:6px; user-select:none; -webkit-user-select:none; touch-action:none; }
    #touch-controls button { display:grid; place-items:center; width:54px; height:54px; border:1px solid rgba(255,255,255,.5); border-radius:16px; color:#fff; background:rgba(15,20,28,.72); font:700 24px/1 system-ui,sans-serif; box-shadow:0 4px 18px rgba(0,0,0,.35); touch-action:none; -webkit-tap-highlight-color:transparent; }
    #touch-controls button:active { background:rgba(139,92,246,.85); transform:scale(.96); }
    #touch-controls button:nth-child(1) { grid-column:2; grid-row:1; }
    #touch-controls button:nth-child(2) { grid-column:1; grid-row:2; }
    #touch-controls button:nth-child(3) { grid-column:2; grid-row:2; }
    #touch-controls button:nth-child(4) { grid-column:3; grid-row:2; }
    @media (pointer:coarse), (max-width:720px) { #touch-controls { display:grid; } }""",
    "add responsive touch pad styling",
)
html = replace_once(
    shell,
    """    <canvas id="canvas" onclick="this.focus();this.requestPointerLock()" oncontextmenu="event.preventDefault()" tabindex=-1></canvas>
    <script type='text/javascript'>var Module = {canvas: document.getElementById('canvas')};</script>""",
    """    <canvas id="canvas" onclick="this.focus()" oncontextmenu="event.preventDefault()" tabindex=-1></canvas>
    <div id="touch-controls" role="group" aria-label="Move the character">
        <button type="button" data-key="2" aria-label="Move up">↑</button>
        <button type="button" data-key="0" aria-label="Move left">←</button>
        <button type="button" data-key="3" aria-label="Move down">↓</button>
        <button type="button" data-key="1" aria-label="Move right">→</button>
    </div>
    <script type='text/javascript'>
    var Module = {canvas: document.getElementById('canvas')};
    function setCatroomsKey(direction, pressed) {
        function send() {
            if (window.Module && typeof window.Module._catrooms_set_key === 'function') {
                window.Module._catrooms_set_key(direction, pressed ? 1 : 0);
                return true;
            }
            return false;
        }
        if (send()) return;
        var timer = window.setInterval(function () { if (send()) window.clearInterval(timer); }, 50);
        window.setTimeout(function () { window.clearInterval(timer); }, 10000);
    }
    document.querySelectorAll('#touch-controls button').forEach(function (button) {
        var direction = Number(button.getAttribute('data-key'));
        button.addEventListener('pointerdown', function (event) {
            event.preventDefault();
            if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
            setCatroomsKey(direction, true);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
            button.addEventListener(name, function (event) { event.preventDefault(); setCatroomsKey(direction, false); });
        });
    });
    window.addEventListener('blur', function () {
        document.querySelectorAll('#touch-controls button').forEach(function (button) {
            setCatroomsKey(Number(button.getAttribute('data-key')), false);
        });
    });
    </script>""",
    "install accessible directional buttons and key bridge",
)
