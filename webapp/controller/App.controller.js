sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/mvc/XMLView",
  "sap/ui/model/json/JSONModel"
], function (Controller, XMLView, JSONModel) {
  "use strict";

  return Controller.extend("iflow.map.prototype.controller.App", {

    onInit: function () {
      this._viewCache = {};
      this._defaultKey = "NetworkGraph";
      this._currentNavKey = null;

      // viewMode model shared across all views via Component
      var oComponent = this.getOwnerComponent();
      var oModeModel = new JSONModel({ mode: "connection" });
      oComponent.setModel(oModeModel, "viewMode");
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

    onModeChange: function (oEvent) {
      var sKey = oEvent.getParameter("item").getKey();
      var oComponent = this.getOwnerComponent();
      oComponent.getModel("viewMode").setProperty("/mode", sKey);

      // Notify current view's controller
      var sCurrent = this._currentNavKey;
      if (sCurrent && this._viewCache[sCurrent]) {
        var oController = this._viewCache[sCurrent].getController();
        if (oController && typeof oController.onModeChange === "function") {
          oController.onModeChange(sKey);
        }
      }
    },

    _navigateTo: function (sKey) {
      var oNavContainer = this.byId("navContainer");
      var that = this;
      this._currentNavKey = sKey;

      if (this._viewCache[sKey]) {
        oNavContainer.to(this._viewCache[sKey]);
        // Ensure mode is propagated when switching back to a cached view
        var oController = this._viewCache[sKey].getController();
        var sMode = this.getOwnerComponent().getModel("viewMode").getProperty("/mode");
        if (oController && typeof oController.onModeChange === "function") {
          oController.onModeChange(sMode);
        }
        return;
      }

      XMLView.create({
        viewName: "iflow.map.prototype.view." + sKey
      }).then(function (oView) {
        var oComponent = that.getOwnerComponent();
        oView.setModel(oComponent.getModel("raw"), "raw");
        oView.setModel(oComponent.getModel("viewMode"), "viewMode");
        that._viewCache[sKey] = oView;
        oNavContainer.addPage(oView);
        oNavContainer.to(oView);
      });
    }
  });
});
