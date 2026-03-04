sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
  "use strict";

  return UIComponent.extend("iflow.map.prototype.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      var oRawModel = new JSONModel();
      oRawModel.loadData(sap.ui.require.toUrl("iflow/map/prototype/model/mockData.json"));
      this.setModel(oRawModel, "raw");
    }
  });
});
