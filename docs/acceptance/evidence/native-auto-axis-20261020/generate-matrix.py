from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re,json,hashlib
out=Path(__file__).resolve().parent
source=out.parent/'native-marker-size-20261020/web-marker-size9.xlsx'
cases=[
 ('base120',[60,100,120],[70,80,90],640,400,False),
 ('max119',[60,100,119],[70,80,90],640,400,False),
 ('max121',[60,100,121],[70,80,90],640,400,False),
 ('scale01',[6,10,12],[7,8,9],640,400,False),
 ('scale10',[600,1000,1200],[700,800,900],640,400,False),
 ('narrow',[118,119,120],[118.5,119.2,119.5],640,400,False),
 ('small',[60,100,120],[70,80,90],320,200,False),
 ('large',[60,100,120],[70,80,90],960,600,False),
 ('short',[60,100,120],[70,80,90],640,200,False),
 ('tall',[60,100,120],[70,80,90],640,600,False),
 ('nomarkers',[60,100,120],[70,80,90],640,400,True),
]
with ZipFile(source) as z: base={n:z.read(n) for n in z.namelist()}
manifest=[]
for name,a,b,width,height,hidden in cases:
 parts=base.copy(); sh=parts['xl/worksheets/sheet1.xml'].decode(); chart=parts['xl/charts/chart1.xml'].decode(); drawing=parts['xl/drawings/drawing1.xml'].decode()
 for col,vals in [('B',a),('C',b)]:
  for row,val in enumerate(vals,2): sh=re.sub(fr'(<c r="{col}{row}"[^>]*><v>)[^<]+',fr'\g<1>{val}',sh)
 i=0
 def series(match):
  global i
  s=match.group(0); vals=[a,b][i];i+=1
  cache='<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="3"/>'+''.join(f'<c:pt idx="{j}"><c:v>{v}</c:v></c:pt>' for j,v in enumerate(vals))+'</c:numCache>'
  s=re.sub(r'<c:numCache>.*?</c:numCache>',cache,s)
  if hidden:s=re.sub(r'<c:marker>.*?</c:marker>','<c:marker><c:symbol val="none"/></c:marker>',s)
  return s
 chart=re.sub(r'<c:ser>.*?</c:ser>',series,chart)
 chart=chart.replace('Independent axis titles: line',f'Auto axis: {name}')
 drawing=drawing.replace('<xdr:col>3</xdr:col>','<xdr:col>0</xdr:col>').replace('<xdr:row>6</xdr:row>','<xdr:row>5</xdr:row>').replace('cx="6096000"',f'cx="{width*9525}"').replace('cy="3810000"',f'cy="{height*9525}"')
 parts['xl/worksheets/sheet1.xml']=sh.encode();parts['xl/charts/chart1.xml']=chart.encode();parts['xl/drawings/drawing1.xml']=drawing.encode()
 p=out/f'auto-axis-{name}.xlsx'
 with ZipFile(p,'w',ZIP_DEFLATED) as z:
  for k,v in parts.items():z.writestr(k,v)
 manifest.append({'name':name,'values':[a,b],'width':width,'height':height,'markersHidden':hidden,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'autoMinMaxMajor':not re.search(r'<c:(?:min|max|majorUnit)\b',chart)})
(out/'matrix-inputs.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
