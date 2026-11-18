#!/usr/bin/env python3
"""Integra la fuente visual congelada sin modificar datos ni motores CASUR."""
import os,shutil,json
from pathlib import Path
root=Path.cwd(); src=Path(os.environ["PETROLEO_SOURCE"])
paths="""app.js
core/module-registry/registry.js
core/updates/pwa-update.js
docs/CHANGELOG.md
docs/REDISENO_PETROLEO.md
index.html
manifest.webmanifest
master/convertidor/css/styles.css
master/convertidor/index.html
modules/insumos/index.html
modules/inventario/index.html
modules/labores/assets/index-BY74yemB.css
modules/labores/index.html
modules/produccion/css/casur-upgrade.css
modules/produccion/css/maestro-ux.css
modules/produccion/index.html
modules/produccion/tests/maestro-ux.test.mjs
modules/produccion/tests/managerial-presentation.test.mjs
modules/riego/assets/index-B0LwgFY-.css
modules/riego/index.html
modules/tch/css/casur.css
modules/tch/index.html
private/conciliacion/index.html
shared/assets/fonts/INTER_LICENSE.txt
shared/assets/fonts/inter-latin-wght-normal.woff2
shared/components/icons.js
shared/geo/geo.css
shared/styles/app.css
shared/styles/module-theme.css
shared/styles/tokens.css
tools/retheme-petroleo.mjs""".splitlines()
for p in paths:
    if not (src/p).is_file(): raise RuntimeError("No existe origen: "+p)
    (root/p).parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(src/p,root/p)
def change(path,func):
    p=root/path; old=p.read_text(encoding="utf-8");new=func(old)
    if new==old:raise RuntimeError("Sin cambio: "+path)
    p.write_text(new,encoding="utf-8")
d=chr(36)
def icons(s):
    for m in ["produccion","tch","riego","insumos","labores"]:
        s=s.replace("'shared/assets/logos/"+m+".svg'","'shared/assets/logos/"+m+"-512.png'")
    s=s.replace("'shared/assets/logos/inventario.png'","'shared/assets/logos/inventario-512.png'")
    s=s.replace("const item = (path, label, iconKey) =>","const item = (path, label, iconKey, moduleId = null) =>")
    s=s.replace(d+"{icon(iconKey)}<span>"+d+"{label}</span></button>",
      d+"{moduleId ? '<img src=\"' + logoFor(moduleId) + '\" alt=\"\" width=\"22\" height=\"22\" loading=\"lazy\" decoding=\"async\">' : icon(iconKey)}<span>"+d+"{label}</span></button>")
    s=s.replace("item('/modulo/' + m.moduleId, m.name, m.icon)","item('/modulo/' + m.moduleId, m.name, m.icon, m.moduleId)")
    for cls,key,px in [("mod-card__tile","m.moduleId",44),("module-switcher__logo","target.moduleId",32),("mrow__tile","m.moduleId",32)]:
        sourceicon="m.icon" if key=="m.moduleId" else "target.icon"
        before='<span class="'+cls+'">'+d+'{icon('+sourceicon+')}</span>'
        after='<span class="'+cls+'"><img src="'+d+'{logoFor('+key+')}" alt="" width="'+str(px)+'" height="'+str(px)+'" loading="lazy" decoding="async"></span>'
        if before not in s:raise RuntimeError("Falta control: "+cls)
        s=s.replace(before,after)
    return s
change("app.js",icons)
change("shared/styles/app.css",lambda s:s+"""
/* Iconos reales de los módulos CASUR; conservan sus colores originales. */
.mod-card__tile:has(img),.module-switcher__logo:has(img),.mrow__tile:has(img){background:transparent;border-color:transparent}
.mod-card__tile img{display:block;width:44px;height:44px;object-fit:contain;border-radius:10px}
.module-switcher__logo img,.mrow__tile img{display:block;width:32px;height:32px;object-fit:contain;border-radius:8px}
.rail__item img{display:block;width:21px;height:21px;object-fit:contain;border-radius:5px;flex-shrink:0}
@media(max-width:375px){.mod-card__tile img{width:40px;height:40px}}
""")
def update_version(s):
    s=s.replace("export const APP_VERSION = '1.5.6';","export const APP_VERSION = '1.5.7';",1)
    entry=("export const APP_RELEASES = Object.freeze([\n"
      "  Object.freeze({id:'shell',version:'1.5.7',type:'PATCH',publishedAt:null,changes:Object.freeze(["
      "'Rediseño Petróleo y Pizarra con nueva navegación empresarial y móvil.',"
      "'Iconos originales de los seis módulos; motores y datos conservados.'])}),")
    return s.replace("export const APP_RELEASES = Object.freeze([",entry,1)
change("core/versions/versions.js",update_version)
base="1f9fe9aaef755a34e8cec2f2bbbfc487966fd1ab"
parts={
"produccion":["modules/produccion/css/casur-upgrade.css","modules/produccion/css/maestro-ux.css","modules/produccion/index.html"],
"tch":["modules/tch/css/casur.css","modules/tch/index.html"],
"riego":["modules/riego/assets/index-B0LwgFY-.css","modules/riego/index.html"],
"insumos":["modules/insumos/index.html"],
"inventario":["modules/inventario/index.html"],
"labores":["modules/labores/assets/index-BY74yemB.css","modules/labores/index.html"]
}
reason="Migración visual de CSS y HTML de tema Petróleo sin cambiar motores, algoritmos, datos, API, identidad de módulo ni lógica agronómica; versión del shell 1.5.7."
(root/"core/versions/release-exceptions.json").write_text(json.dumps([dict(base=base,owner=k,reason=reason,paths=v) for k,v in parts.items()],indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
for path in ["tests/app-version.test.mjs","tests/runtime-bundles.test.mjs","tests/sw-bundle-transaction.test.mjs"]:
    change(path,lambda s:s.replace("1.5.6","1.5.7"))
(root/"tests/shell-module-icons.test.mjs").write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const shell=readFileSync('app.js','utf8');
test('seis logos institucionales sin iconos genéricos',()=>{
for(const id of ['produccion','tch','riego','insumos','inventario','labores']){
 assert.ok(existsSync('shared/assets/logos/'+id+'-512.png'));
 assert.ok(shell.includes('shared/assets/logos/'+id+'-512.png'));
}
for(const name of ['mod-card__tile','module-switcher__logo','mrow__tile'])assert.ok(shell.includes(name+'"><img'));
});
""",encoding="utf-8")
(root/"docs/INTEGRACION_PETROLEO.md").write_text("Integración desde commit de preview 2a00eac0993aa8d89cd600d48014d977a7706e60 sobre base 1f9fe9aaef755a34e8cec2f2bbbfc487966fd1ab.\nConserva datos y motores oficiales. Pendiente QA y autorización para merge.\n",encoding="utf-8")
print("Migración de diseño + seis logos + versionado preparada")
