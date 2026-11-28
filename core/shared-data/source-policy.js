import {compareMaestroVersions} from '../../master/adapters/master-to-riego-adapter.js';

// Política vigente de resolución entre la generación oficial publicada y una generación local guardada.
// Copia exacta de modules/produccion/js/official-source-policy.js, en el núcleo para que el contrato del Maestro
// Central no dependa del bundle de Producción. tests/source-policy-parity.test.mjs exige que ambas decidan igual;
// en su próxima liberación Producción reexportará esta implementación y se eliminará la copia.
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
// Clave de la elección explícita del propietario ('official' | 'personal'); la escriben Producción y el Centro Maestro.
export const SOURCE_PREFERENCE_KEY='casur-production-source';
