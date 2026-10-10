"""Validate package schema subset, references and safe SVGs; no dependencies."""
from pathlib import Path
import json
import math
import re
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
SCHEMA=json.loads((ROOT/'schemas/workspace.schema.json').read_text(encoding='utf-8'))

def validate(value, schema, at='$'):
    if '$ref' in schema:
        target=SCHEMA
        for key in schema['$ref'][2:].split('/'): target=target[key]
        return validate(value,target,at)
    if 'const' in schema: assert value==schema['const'],at+' const'
    if 'enum' in schema: assert value in schema['enum'],at+' enum'
    kind=schema.get('type')
    checks={'object':lambda v:isinstance(v,dict),'array':lambda v:isinstance(v,list),'string':lambda v:isinstance(v,str),'number':lambda v:type(v) in (int,float) and math.isfinite(v),'integer':lambda v:type(v)==int,'boolean':lambda v:type(v)==bool}
    if kind: assert checks[kind](value),at+' type'
    if kind=='object':
        assert all(k in value for k in schema.get('required',[])),at+' required'
        props=schema.get('properties',{})
        if schema.get('additionalProperties') is False: assert set(value)<=set(props),at+' unknown properties'
        for k,v in value.items():
            if k in props:validate(v,props[k],at+'.'+k)
    if kind=='array':
        assert len(value)>=schema.get('minItems',0),at+' length'
        for i,v in enumerate(value):validate(v,schema.get('items',{}),f'{at}[{i}]')
    if kind=='string':assert len(value)>=schema.get('minLength',0),at+' length'
    for key,op in [('minimum',lambda v,b:v>=b),('maximum',lambda v,b:v<=b),('exclusiveMinimum',lambda v,b:v>b)]:
        if key in schema:assert op(value,schema[key]),at+' '+key

def check_workspace(doc):
    validate(doc,SCHEMA)
    ids=[doc['id']]+[s['id'] for s in doc['sources']]+[s['id'] for s in doc['screens']]+[w['id'] for s in doc['screens'] for w in s['widgets']]
    assert len(ids)==len(set(ids)),'Duplicate IDs'
    sources={s['id'] for s in doc['sources']}
    for screen in doc['screens']:
        for w in screen['widgets']:
            b=w.get('binding'); settings=w['settings']
            if b: assert b['sourceId'] in sources,'Dangling source'
            if b and b['writable']:assert b['gain']!=0,'Zero-gain writable binding'
            if 'min' in settings and 'max' in settings:assert settings['max']>settings['min'],'Invalid range'

demo=json.loads((ROOT/'examples/demo.olw.json').read_text(encoding='utf-8'))
check_workspace(demo)
# Ensure representative malformed packages are rejected.
for mutate in [lambda d:d.update(schemaVersion=99),lambda d:d['screens'][0]['widgets'][0]['rect'].update(width=0),lambda d:d['screens'][0]['widgets'][0]['binding'].update(sourceId='missing')]:
    bad=json.loads(json.dumps(demo));mutate(bad)
    try:check_workspace(bad)
    except AssertionError:pass
    else:raise AssertionError('Invalid fixture accepted')
mock=json.loads((ROOT/'examples/mock-symbols.json').read_text(encoding='utf-8'))
paths={s['path'] for s in mock['symbols']}
for screen in demo['screens']:
    for w in screen['widgets']:assert w['binding']['symbolPath'] in paths
assert mock['symbols'][-1]['mock']['value']=='9007199254740993'
svgs=list((ROOT/'assets').glob('*/*.svg'))
assert len(svgs)>=30
for path in svgs:
    tree=ET.parse(path);root=tree.getroot()
    box=list(map(float,root.attrib['viewBox'].split()));assert box[2]>0 and box[3]>0
    for el in root.iter():
        assert el.tag.split('}')[-1] not in {'script','foreignObject','image'},path
        for key,v in el.attrib.items():
            assert not key.lower().startswith('on'),path
            assert 'href' not in key.lower(),path
            assert 'url(' not in v.lower(),path
for path in [ROOT/'README.md',*ROOT.glob('docs/*.md')]:
    for link in re.findall(r'\]\(([^)]+)\)',path.read_text(encoding='utf-8')):
        if not re.match(r'\w+://',link) and not link.startswith('#'):assert (path.parent/link.split('#')[0]).exists(),(path,link)
print(f'PASS: workspace schema subset, 3 negative cases, symbol references, {len(svgs)} safe SVGs, Markdown links.')
