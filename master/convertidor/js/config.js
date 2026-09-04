(function () {
  "use strict";

  const STATUS_OPTIONS = [
    "Mantener activo",
    "Sin caña / No cosecha Z26/27",
    "Pendiente de estimar TCH",
    "Semilla",
    "Área corregida",
    "Excluir del estimado",
    "Revisar después",
    "Baja definitiva",
  ];

  const MASTER_COLUMNS = [
    "Hac-Sue", "Cod", "Hacienda", "Suerte", "Area", "Variedad", "Edad",
    "TCH_Z2526", "TCH_Estimado_Z2627", "Ton_Estimadas_Z2627", "#_de_Corte",
    "Surco", "Textura", "F. Ult. Cte", "F. Siembra", "Km", "Tch.Inic",
    "Tch.Act", "Destino", "Tenencia", "Tipo_de_Riego", "#_de_Riegos",
    "ERP", "ZONA", "Estado", "Observación",
  ];

  const ALIASES = {
    siagri: {
      cod: ["cod. hacienda", "cod hacienda", "codhacienda", "codhac", "cod"],
      hacienda: ["nombre hacienda", "nomhacienda", "hacienda"],
      suerte: ["ste", "suerte"],
      km: ["dt", "km"],
      variedad: ["variedad"],
      corte: ["nc", "# de corte", "numero de corte", "corte"],
      textura: ["nombre textura", "textura2", "tipo suelo", "tiposuelo", "textura"],
      surco: ["surco"],
      tchInic: ["tch.inic", "tchinic"],
      tchAct: ["tch.act", "tchact"],
      fSiembra: ["f. siembra", "fsiembra", "fecsiembra", "fecha siembra"],
      fUltCte: ["f. ult. cte", "fultcte", "fecultcorte", "fecha ultimo corte"],
      tchPrev: ["tch.ant", "tchant", "tch z2526", "tch_z2526"],
      destino: ["nombre destino del cultivo", "destino"],
      tenencia: ["tn", "tenencia"],
      tipoRiego: ["tipo_de_riego", "tipo de riego", "nombre tipo de riego", "tiporiego"],
      numRiegos: ["nr", "numero de riegos", "# de riegos", "#_de_riegos"],
      erp: ["erp"],
      zona: ["zona"],
      area: ["area", "área"],
    },
    estimate: {
      zona: ["zona"],
      cod: ["codhacienda", "cod hacienda", "codhac", "cod"],
      hacienda: ["nomhacienda", "nombre hacienda", "hacienda"],
      suerte: ["suerte", "ste"],
      variedad: ["variedad"],
      corte: ["nc", "# de corte", "numero de corte"],
      textura: ["tiposuelo", "tipo suelo", "nombre textura", "textura"],
      fSiembra: ["fecsiembra", "f. siembra", "fecha siembra"],
      fUltCte: ["fecultcorte", "f. ult. cte", "fecha ultimo corte"],
      destino: ["destino", "nombre destino del cultivo"],
      tenencia: ["tenencia", "tn"],
      tipoRiego: ["tipo_de_riego", "tipo de riego", "nombre tipo de riego", "tiporiego"],
      area: ["area", "área"],
      tch: ["tch estimado", "tch_est", "tch est", "tch"],
      ton: ["ton estimadas", "toneladas", "ton_", "ton"],
    },
  };

  window.CASUR_CONFIG = {
    STATUS_OPTIONS,
    MASTER_COLUMNS,
    ALIASES,
    TENURE_MAP: { CA: "Arriendo", CV: "Compra Venta", PR: "Propio" },
    SCHEMA_VERSION: "1.1",
    APP_VERSION: "1.1.0",
  };
})();
