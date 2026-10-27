import {compareMaestroVersions} from '../../../master/adapters/master-to-riego-adapter.js';

// Unknown/legacy or customized generations require an explicit source choice.
// Only an unchanged, archived ordinary import is automatically replaceable.
export function officialSourcePriority({official,current,personal=false,preference,snapshot={},online=true}) {
 if(!online)return 'offline';
 if(compareMaestroVersions(official,current)!==1)return 'not-newer';
 if(!personal)return 'official';
 if(preference==='personal')return 'pinned';
 const {production:p,maestro,archive}=snapshot,op=p?.operationalDataset;
 if(p?.dataVersion!==current||p?.meta?.manualChanges!==false||op?.cronologico?.meta?.manualChanges!==false||
    p?.meta?.customized||op?.cronologico?.meta?.customized||op?.contractVersion!==1||op?.baseline||
    op?.dataVersion!==current||op?.cronologico?.meta?.dataVersion!==current||!op?.catalog?.length||
    maestro?.version!==current||!archive?.production||!archive?.maestro)return 'preserved';
 if(JSON.stringify(p)!==JSON.stringify(archive.production)||JSON.stringify(maestro)!==JSON.stringify(archive.maestro))return 'customized';
 return 'official';
}
