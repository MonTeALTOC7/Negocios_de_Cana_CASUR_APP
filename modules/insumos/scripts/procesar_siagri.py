#!/usr/bin/env python3
"""
Procesador de datos SIAGRI para Control y Seguimiento de Insumos CASUR.
Genera los archivos JSON necesarios para la PWA.

Uso:
  python3 procesar_siagri.py \
    --reporte "registro_de_programacion_de_labores.xlsx" \
    --maestro "Cronologico_Maestro_CASUR.xlsx" \
    --output "./data/"

Requisitos:
  pip install openpyxl
"""
import argparse
import json
import hashlib
import re
import os
from collections import defaultdict, Counter
from datetime import datetime, date

try:
    import openpyxl
except ImportError:
    print("ERROR: Se requiere openpyxl. Instalar con: pip install openpyxl")
    exit(1)

# Labores aéreas de madurante que NO se cobran a productores (módulo aparte)
LABORES_AEREAS_MADURANTE = {'AAM'}   # Aplicación aérea Madurante
LABORES_AEREAS = {'AAM', 'CAP'}      # AAM + Control químico aéreo de plagas


def norm_suerte(s):
    if s is None: return ''
    s = str(s).strip().upper()
    s = re.sub(r'\.0$', '', s)
    s = re.sub(r'\s+', '', s)
    return s

def norm_hac(h):
    if h is None: return ''
    h = str(h).strip()
    h = re.sub(r'\.0$', '', h)
    h = re.sub(r'\s+', '', h)
    return h

def norm_unit(u):
    if not u: return ''
    u = str(u).strip().upper()
    mapping = {
        'LT': 'LT', 'L': 'LT', 'LTS': 'LT', 'LITROS': 'LT',
        'KG': 'KG', 'KGS': 'KG', 'GR': 'GR', 'G': 'GR',
        'SACO': 'SACO', 'SACOS': 'SACO', 'SC': 'SACO',
        'UND': 'UND', 'UNIDAD': 'UND', 'GAL': 'GAL', 'GALON': 'GAL',
        'HA': 'HA',
    }
    return mapping.get(u, u)

def fix_date(d):
    if d is None: return None
    if isinstance(d, datetime):
        if d.year < 1900:
            try: return d.replace(year=d.year + 1820)
            except: return None
        return d
    return d

def date_to_str(d):
    d = fix_date(d)
    if d is None: return None
    if isinstance(d, (datetime, date)):
        return d.strftime('%Y-%m-%d')
    return str(d)

def safe_float(v):
    if v is None: return 0
    try: return round(float(v), 6)
    except: return 0

def safe_int(v):
    if v is None: return 0
    try: return int(float(v))
    except: return 0


def find_reporte_sheet(wb):
    """Find the REPORTE sheet (case-insensitive, strip spaces)."""
    for name in wb.sheetnames:
        clean = name.strip().upper()
        if clean == 'REPORTE':
            return name
    # Fallback: first sheet with many rows
    for name in wb.sheetnames:
        if 'reporte' in name.lower() and '(2)' not in name.lower():
            return name
    return wb.sheetnames[0]


def process(reporte_path, maestro_path, output_dir):
    print(f"Procesando reporte: {reporte_path}")
    print(f"Procesando maestro: {maestro_path}")

    # ─── Load REPORTE ───
    wb = openpyxl.load_workbook(reporte_path, data_only=True, read_only=True)
    sheet_name = find_reporte_sheet(wb)
    print(f"Hoja seleccionada: '{sheet_name}'")
    ws = wb[sheet_name]

    # Auto-detect header row (find 'Documento' or 'LABOR')
    header_row = None
    headers = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        vals = [str(v).strip() if v else '' for v in row]
        if 'LABOR' in vals or 'Documento' in vals or 'Ejercicio' in vals:
            header_row = i
            headers = vals
            break

    if header_row is None:
        print("ERROR: No se encontró fila de encabezados.")
        return

    # Build column index
    col_map = {}
    for idx, h in enumerate(headers):
        h_lower = h.lower().replace(' ', '_').replace('?', '').replace('(0=no)', '')
        col_map[h_lower.strip()] = idx

    print(f"Encabezados encontrados: {len(headers)} columnas")

    # Map to our expected columns
    def get_col(names):
        for n in names:
            if n in col_map: return col_map[n]
        return None

    COL = {
        'ejercicio': get_col(['ejercicio']),
        'semana': get_col(['semana']),
        'fecha_inicio': get_col(['fecha_inicio', 'fecha_programa']),
        'fecha_final': get_col(['fecha_final']),
        'labor': get_col(['labor']),
        'nombre_labor': get_col(['nombre_labor']),
        'unidad_medida': get_col(['unidad_de_medida']),
        'unidades': get_col(['unidades']),
        'hacienda': get_col(['hacienda']),
        'nombre_hacienda': get_col(['nombre_hacienda']),
        'zona': get_col(['zona']),
        'nombre_zona': get_col(['nombre_zona']),
        'suerte': get_col(['suerte']),
        'producto': get_col(['producto']),
        'desc_producto': get_col(['desc._producto', 'desc_producto']),
        'dosis': get_col(['dosis']),
        'cantidad': get_col(['cantidad']),
        'usuario': get_col(['usuario']),
        'fecha_ejecucion': get_col(['fecha_ejecuccion', 'fecha_ejecucion']),
        'suspendida': get_col(['suspendida_']),
        'documento': get_col(['documento']),
        'bodega': get_col(['bodega']),
        'nombre_bodega': get_col(['nombre_bodega']),
        'con_reserva': get_col(['con_reserva']),
        'ejecutado': get_col(['ejecutado']),
    }

    missing = [k for k, v in COL.items() if v is None]
    if missing:
        print(f"ADVERTENCIA: Columnas no mapeadas: {missing}")

    # Read data rows
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i <= header_row: continue
        r = list(row)
        doc_col = COL.get('documento')
        if doc_col is not None and (not r[doc_col] if doc_col < len(r) else True): continue
        rows.append(r)
    wb.close()

    print(f"Filas de datos: {len(rows)}")

    # ─── Exclude Sucuya ───
    sucuya_count = 0
    clean_rows = []
    for r in rows:
        zona = str(r[COL['zona']]).strip() if COL['zona'] is not None and COL['zona'] < len(r) and r[COL['zona']] else ''
        hac = norm_hac(r[COL['hacienda']] if COL['hacienda'] is not None and COL['hacienda'] < len(r) else None)
        nombre_hac = str(r[COL['nombre_hacienda']]).strip().lower() if COL['nombre_hacienda'] is not None and COL['nombre_hacienda'] < len(r) and r[COL['nombre_hacienda']] else ''
        if zona == '16' or hac == '16' or 'sucuya' in nombre_hac:
            sucuya_count += 1
            continue
        clean_rows.append(r)

    print(f"Sucuya excluidas: {sucuya_count}")

    # ─── Group events ───
    def get(r, key):
        idx = COL.get(key)
        if idx is None or idx >= len(r): return None
        return r[idx]

    events_map = defaultdict(list)
    for r in clean_rows:
        doc = str(get(r, 'documento') or '').strip()
        hac = norm_hac(get(r, 'hacienda'))
        sue = norm_suerte(get(r, 'suerte'))
        labor = str(get(r, 'labor') or '').strip()
        key = f"{doc}|{hac}|{sue}|{labor}"
        events_map[key].append(r)

    events = []
    products = []
    event_id = 0

    for ekey, erows in events_map.items():
        event_id += 1
        first = erows[0]

        hac = norm_hac(get(first, 'hacienda'))
        sue = norm_suerte(get(first, 'suerte'))
        area = safe_float(get(first, 'unidades'))
        
        suspendida = str(get(first, 'suspendida') or '0').strip() == '1'
        con_reserva = str(get(first, 'con_reserva') or '').strip().upper() == 'SI'
        ejecutado = str(get(first, 'ejecutado') or '').strip().upper() == 'SI'

        alertas = []
        if suspendida:
            estado = 'INCONSISTENTE' if ejecutado else 'SUSPENDIDA'
            if ejecutado: alertas.append('SUSPENDIDA_CON_EJECUCION')
        elif ejecutado:
            estado = 'EJECUTADA'
        elif con_reserva:
            estado = 'RESERVADA'
        else:
            estado = 'SIN CLASIFICAR'

        fecha_inicio = date_to_str(get(first, 'fecha_inicio'))
        fecha_ejec = date_to_str(get(first, 'fecha_ejecucion'))
        if fecha_ejec and fecha_inicio:
            try:
                if datetime.strptime(fecha_ejec, '%Y-%m-%d') < datetime.strptime(fecha_inicio, '%Y-%m-%d'):
                    alertas.append('FECHA_EJECUCION_ANTERIOR_A_RESERVA')
            except: pass

        areas = set(safe_float(get(r, 'unidades')) for r in erows)
        grouping = 'EXACTA' if len(areas) == 1 else 'INFERIDA'
        if len(areas) > 1: alertas.append('AREA_INCONSISTENTE_EN_MEZCLA')

        eid = f"E{event_id:06d}"
        labor_cod = str(get(first, 'labor') or '').strip()
        es_mad = labor_cod in LABORES_AEREAS_MADURANTE
        es_aereo = labor_cod in LABORES_AEREAS
        evt = {
            'event_id': eid,
            'documento': str(get(first, 'documento') or '').strip(),
            'zona': str(get(first, 'zona') or '').strip(),
            'zona_nombre': str(get(first, 'nombre_zona') or '').strip(),
            'productor': str(get(first, 'nombre_hacienda') or '').strip(),
            'hacienda': hac, 'suerte': sue,
            'hac_sue': f"{hac}{sue}", 'hac_sue_key': f"{hac}|{sue}",
            'labor': str(get(first, 'labor') or '').strip(),
            'labor_nombre': str(get(first, 'nombre_labor') or '').strip(),
            'area': area,
            'fecha_inicio': fecha_inicio,
            'fecha_final': date_to_str(get(first, 'fecha_final')),
            'fecha_ejecucion': fecha_ejec,
            'semana': safe_int(get(first, 'semana')),
            'ejercicio': str(get(first, 'ejercicio') or '').strip(),
            'estado': estado, 'suspendida': suspendida,
            'con_reserva': con_reserva, 'ejecutado': ejecutado,
            'num_productos': len(erows),
            'usuario': str(get(first, 'usuario') or '').strip(),
            'bodega': str(get(first, 'bodega') or '').strip(),
            'bodega_nombre': str(get(first, 'nombre_bodega') or '').strip(),
            'agrupacion': grouping, 'alertas': alertas,
            'es_madurante_aereo': es_mad, 'es_aereo': es_aereo,
        }
        events.append(evt)

        for pr in erows:
            products.append({
                'event_id': eid,
                'producto_codigo': str(get(pr, 'producto') or '').strip(),
                'producto_desc': str(get(pr, 'desc_producto') or '').strip(),
                'unidad_medida': norm_unit(get(pr, 'unidad_medida')),
                'dosis': safe_float(get(pr, 'dosis')),
                'cantidad': safe_float(get(pr, 'cantidad')),
                'area_cubierta': safe_float(get(pr, 'unidades')),
                'estado': estado,
                'es_madurante_aereo': es_mad,
            })

    print(f"Eventos: {len(events)}, Productos: {len(products)}")

    # ─── Load Maestro ───
    maestro = []
    if maestro_path and os.path.exists(maestro_path):
        wb2 = openpyxl.load_workbook(maestro_path, data_only=True, read_only=True)
        maestro_map = {}
        for sname in wb2.sheetnames:
            ws2 = wb2[sname]
            for i, row in enumerate(ws2.iter_rows(values_only=True)):
                if i == 0: continue
                r = list(row)
                hac = norm_hac(r[1] if len(r) > 1 else None)
                sue = norm_suerte(r[3] if len(r) > 3 else None)
                if hac == '16' or 'sucuya' in (str(r[2]).lower() if len(r) > 2 and r[2] else ''): continue
                key = f"{hac}|{sue}"
                entry = {
                    'hac_sue': f"{hac}{sue}", 'hac_sue_key': key,
                    'hacienda': hac, 'nombre_hacienda': str(r[2]).strip() if len(r) > 2 and r[2] else '',
                    'suerte': sue, 'area': safe_float(r[4] if len(r) > 4 else 0),
                    'variedad': str(r[5]).strip() if len(r) > 5 and r[5] else '',
                    'edad': safe_float(r[6] if len(r) > 6 else 0),
                    'tch_z2526': safe_float(r[7] if len(r) > 7 else 0),
                    'corte': str(r[10]).strip() if len(r) > 10 and r[10] else '',
                    'textura': str(r[12]).strip() if len(r) > 12 and r[12] else '',
                    'fecha_ult_corte': date_to_str(r[13] if len(r) > 13 else None),
                    'fecha_siembra': date_to_str(r[14] if len(r) > 14 else None),
                    'km': safe_float(r[15] if len(r) > 15 else 0),
                    'destino': str(r[18]).strip() if len(r) > 18 and r[18] else '',
                    'tenencia': str(r[19]).strip() if len(r) > 19 and r[19] else '',
                    'tipo_riego': str(r[20]).strip() if len(r) > 20 and r[20] else '',
                    'zona': str(r[23]).strip() if len(r) > 23 and r[23] else '',
                    'estado_maestro': str(r[24]).strip() if len(r) > 24 and r[24] else '',
                    'fuente': sname,
                }
                if key not in maestro_map or sname == 'Productores':
                    maestro_map[key] = entry
        wb2.close()
        maestro = list(maestro_map.values())
        print(f"Maestro: {len(maestro)} suertes")

    # ─── Post-pass: alertas dependientes del Maestro ───
    maestro_area = {m['hac_sue_key']: m['area'] for m in maestro}
    maestro_keys = set(maestro_area.keys())
    for e in events:
        if maestro_keys:  # solo si se cargó el maestro
            if e['hac_sue_key'] not in maestro_keys and 'SUERTE_SIN_MAESTRO' not in e['alertas']:
                e['alertas'].append('SUERTE_SIN_MAESTRO')
            ma = maestro_area.get(e['hac_sue_key'])
            if ma and e['area'] > ma * 1.05 and 'AREA_MAYOR_MAESTRO' not in e['alertas']:
                e['alertas'].append('AREA_MAYOR_MAESTRO')

    # ─── Validaciones (resumen para módulo Admin) ───
    validaciones = {
        'suertes_sin_maestro': sorted(set(e['hac_sue'] for e in events if 'SUERTE_SIN_MAESTRO' in e['alertas'])),
        'eventos_area_mayor': [e['event_id'] for e in events if 'AREA_MAYOR_MAESTRO' in e['alertas']],
        'eventos_fecha_alerta': [e['event_id'] for e in events if 'FECHA_EJECUCION_ANTERIOR_A_RESERVA' in e['alertas']],
    }
    total_madurante = sum(1 for e in events if e.get('es_madurante_aereo'))

    # ─── Generate metadata ───
    all_dates = []
    for e in events:
        for d in [e['fecha_ejecucion'], e['fecha_inicio'], e['fecha_final']]:
            if d and d.startswith('20'): all_dates.append(d)
    
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    data_hash = hashlib.sha256(json.dumps({'e': len(events), 'p': len(products), 't': now}).encode()).hexdigest()[:12]

    metadata = {
        'version': 1,
        'generated_at': now,
        'fecha_corte': max(all_dates) if all_dates else None,
        'fecha_min': min(all_dates) if all_dates else None,
        'archivo_fuente': os.path.basename(reporte_path),
        'total_eventos': len(events),
        'total_productos': len(products),
        'total_maestro': len(maestro),
        'filas_originales': len(rows) + sucuya_count,
        'filas_validas': len(clean_rows),
        'filas_excluidas_sucuya': sucuya_count,
        'hash': data_hash,
        'labores_aereas_madurante': sorted(LABORES_AEREAS_MADURANTE),
        'total_eventos_madurante_aereo': total_madurante,
        'pwa_min_version': '1.0.0',
    }

    # ─── Write JSON ───
    os.makedirs(output_dir, exist_ok=True)

    with open(os.path.join(output_dir, 'metadata.json'), 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    bootstrap = {'meta': metadata, 'events': events, 'products': products, 'maestro': maestro, 'validaciones': validaciones}
    with open(os.path.join(output_dir, 'bootstrap.json'), 'w', encoding='utf-8') as f:
        json.dump(bootstrap, f, ensure_ascii=False)

    print(f"\n✅ Archivos generados en {output_dir}")
    print(f"   metadata.json: {os.path.getsize(os.path.join(output_dir, 'metadata.json'))} bytes")
    print(f"   bootstrap.json: {os.path.getsize(os.path.join(output_dir, 'bootstrap.json'))} bytes")
    print(f"\n   Eventos: {len(events)}")
    print(f"   Productos: {len(products)}")
    print(f"   Maestro: {len(maestro)}")
    
    estados = Counter(e['estado'] for e in events)
    print(f"   Estados: {dict(estados)}")
    
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Procesar datos SIAGRI para Insumos CASUR')
    parser.add_argument('--reporte', required=True, help='Excel SIAGRI de programación de labores')
    parser.add_argument('--maestro', required=False, help='Excel Cronológico Maestro CASUR')
    parser.add_argument('--output', default='./data/', help='Directorio de salida para JSON')
    args = parser.parse_args()
    process(args.reporte, args.maestro, args.output)
