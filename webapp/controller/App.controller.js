sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/mvc/XMLView"
], function (Controller, XMLView) {
  "use strict";

  return Controller.extend("iflow.map.prototype.controller.App", {

    onInit: function () {
      this._viewCache = {};
      // Auto-select the first nav item after rendering
      this._defaultKey = "NetworkGraph";
    },

    onAfterRendering: function () {
      if (this._initialised) { return; }
      this._initialised = true;
      this._navigateTo(this._defaultKey);
    },

    onNavItemSelect: function (oEvent) {
      var sKey = oEvent.getParameter("item").getKey();
      this._navigateTo(sKey);
    },

    _navigateTo: function (sKey) {
      var oNavContainer = this.byId("navContainer");
      var that = this;

      if (this._viewCache[sKey]) {
        oNavContainer.to(this._viewCache[sKey]);
        return;
      }

      XMLView.create({
        viewName: "iflow.map.prototype.view." + sKey
      }).then(function (oView) {
        // Propagate component models to the created view
        var oComponent = that.getOwnerComponent();
        oView.setModel(oComponent.getModel("raw"), "raw");
        that._viewCache[sKey] = oView;
        oNavContainer.addPage(oView);
        oNavContainer.to(oView);
      });
    }
  });
});
