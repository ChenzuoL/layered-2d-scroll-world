#!/usr/bin/env python3
"""Validate transparent production assets using ImageMagick, no Python imaging deps."""
import argparse, json, re, subprocess
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('asset_dir',type=Path)
p.add_argument('--margin',type=int,default=8)
p.add_argument('--output',type=Path)
a=p.parse_args()
records=[];failures=[]
files=sorted([*a.asset_dir.glob('*.png'),*a.asset_dir.glob('*.webp')])
if not files:raise SystemExit('No PNG/WebP assets found')
for file in files:
    try:
        raw=subprocess.check_output(['identify','-format','%w %h %[opaque]',str(file)],text=True).split()
        width,height=int(raw[0]),int(raw[1]);opaque=raw[2].lower()=='true'
        geometry=subprocess.check_output(['convert',str(file),'-alpha','extract','-threshold','3%','-format','%@','info:'],text=True).strip()
        match=re.fullmatch(r'(\d+)x(\d+)\+(-?\d+)\+(-?\d+)',geometry)
        bbox=None if not match else [int(match[3]),int(match[4]),int(match[3])+int(match[1]),int(match[4])+int(match[2])]
        record={'file':file.name,'size':[width,height],'nonempty':bbox is not None,'hasTransparency':not opaque}
        if bbox:
            record['alphaBbox']=bbox
            record['edgeTouch']=bbox[0]<a.margin or bbox[1]<a.margin or bbox[2]>width-a.margin or bbox[3]>height-a.margin
        else:record['edgeTouch']=True
        reasons=[]
        if not record['nonempty']:reasons.append('empty')
        if not record['hasTransparency']:reasons.append('fully opaque')
        if record['edgeTouch']:reasons.append('alpha bbox touches safe margin')
    except (subprocess.CalledProcessError,ValueError,IndexError) as error:
        record={'file':file.name,'ok':False,'reasons':['inspection failed: '+str(error)]};reasons=record['reasons']
    record['ok']=not reasons;record['reasons']=reasons
    if reasons:failures.append(record)
    records.append(record)
result={'valid':not failures,'count':len(files),'failures':failures,'records':records}
text=json.dumps(result,indent=2)
if a.output:a.output.write_text(text)
print(text)
raise SystemExit(0 if result['valid'] else 1)
