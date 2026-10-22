// Build review sheets and a per-PDF manifest from actual rendered pages, not HTML previews.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const dir=process.env.CASUR_QA_OUT;if(!dir)throw Error('Defina CASUR_QA_OUT');
async function run(){
  const results=JSON.parse(fs.readFileSync(path.join(dir,'qa-results.json'),'utf8'));
  const lines=['# Auditoría de PDFs reales','','Cada página está renderizada a PNG. Las hojas de contacto no sustituyen los PNG completos.','','| PDF | Páginas | Filas | Faltantes/duplicadas | Advertencias de píxeles |','|---|---:|---:|---|---|'];
  for(const r of results){
    lines.push(`| ${r.file} | ${r.pages.length} | ${r.layout.sourceRows} | ${r.layout.missingRows}/${r.layout.duplicatedRows} | ${r.pages.filter(p=>p.warning).map(p=>p.png).join(', ')||'Ninguna'} |`);
    for(let i=0;i<r.pages.length;i+=4){
      const tiles=[];
      for(let j=0;j<Math.min(4,r.pages.length-i);j++){
        const p=r.pages[i+j],x=(j%2)*650,y=Math.floor(j/2)*890;
        tiles.push({input:await sharp(path.join(dir,p.png)).resize({width:650,height:850,fit:'inside'}).png().toBuffer(),left:x,top:y+25});
        tiles.push({input:Buffer.from(`<svg width="650" height="25"><rect width="650" height="25" fill="#ddd"/><text x="10" y="17" font-family="Arial" font-size="13">${p.png}</text></svg>`),left:x,top:y});
      }
      await sharp({create:{width:1300,height:Math.min(2,Math.ceil((r.pages.length-i)/2))*890,channels:3,background:'#fff'}}).composite(tiles).png().toFile(path.join(dir,r.file.replace('.pdf',`_contacto_${i/4+1}.png`)));
    }
  }
  fs.writeFileSync(path.join(dir,'QA_POR_PDF.md'),lines.join('\n'));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
