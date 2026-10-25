// SheetJS is supplied by the existing application, never fetched from a new CDN.
export function workbookSheets(workbook, XLSX) {
  return workbook.SheetNames.map(name=>{
    const sheet=workbook.Sheets[name],range=XLSX.utils.decode_range(sheet['!ref']||'A1'),formulas={};
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true,range:{s:{r:0,c:0},e:range.e}});
    for(const [address,cell] of Object.entries(sheet)){
      if(address.startsWith('!'))continue;
      const at=XLSX.utils.decode_cell(address);
      if(cell.f)formulas[`${at.r+1}:${at.c+1}`]=cell.f;
      // Identity strings use an explicit numeric display mask, not arbitrary padding.
      if(cell.t==='n'&&/^0{2,}$/.test(cell.z||'')&&cell.w)rows[at.r][at.c]=cell.w;
      if(cell.t==='e')rows[at.r][at.c]=cell.w||'#ERROR';
    }
    return {name,rows,formulas};
  });
}
