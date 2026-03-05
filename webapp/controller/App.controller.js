sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/mvc/XMLView",
  "sap/ui/core/Item",
  "sap/ui/model/json/JSONModel",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, XMLView, Item, JSONModel, GraphUtils) {
  "use strict";

  return Controller.extend("iflow.map.prototype.controller.App", {

    onInit: function () {
      this._viewCache = {};
      this._defaultKey = "NetworkGraph";
      this._currentNavKey = null;

      // viewMode model shared across all views via Component
      var oComponent = this.getOwnerComponent();
      var oModeModel = new JSONModel({ mode: "connection", packageFilter: "ALL" });
      oComponent.setModel(oModeModel, "viewMode");
    },

    onAfterRendering: function () {
      if (this._initialised) { return; }
      this._initialised = true;

      // Populate package filter from raw data
      this._populatePackageFilter();

      this._navigateTo(this._defaultKey);
    },

    _populatePackageFilter: function () {
      var oRawModel = this.getOwnerComponent().getModel("raw");
      var that = this;

      var fnPopulate = function (oRaw) {
        var aPackages = GraphUtils.getPackages(oRaw);
        var oSelect = that.byId("packageFilter");
        oSelect.removeAllItems();
        aPackages.forEach(function (p) {
          oSelect.addItem(new Item({ key: p.key, text: p.text }));
        });
        oSelect.setSelectedKey("ALL");
      };

      var oRaw = oRawModel.getData();
      if (oRaw && oRaw.iflows) {
        fnPopulate(oRaw);
      } else {
        oRawModel.attachRequestCompleted(function (oEvent) {
          if (oEvent.getParameter("success")) {
            fnPopulate(oRawModel.getData());
          }
        });
      }
    },

    onNavItemSelect: function (oEvent) {
      var sKey = oEvent.getParameter("item").getKey();
      this._navigateTo(sKey);
    },

    onModeChange: function (oEvent) {
      var sKey = oEvent.getParameter("item").getKey();
      var oComponent = this.getOwnerComponent();
      oComponent.getModel("viewMode").setProperty("/mode", sKey);

      this._notifyCurrentController("onModeChange", sKey);
    },

    onPackageFilterChange: function (oEvent) {
      var sPackageId = oEvent.getSource().getSelectedKey();
      var oComponent = this.getOwnerComponent();
      oComponent.getModel("viewMode").setProperty("/packageFilter", sPackageId);

      this._notifyCurrentController("onPackageFilterChange", sPackageId);
    },

    _notifyCurrentController: function (sMethod, vArg) {
      var sCurrent = this._currentNavKey;
      if (sCurrent && this._viewCache[sCurrent]) {
        var oController = this._viewCache[sCurrent].getController();
        if (oController && typeof oController[sMethod] === "function") {
          oController[sMethod](vArg);
        }
      }
    },

    _navigateTo: function (sKey) {
      var oNavContainer = this.byId("navContainer");
      var that = this;
      this._currentNavKey = sKey;

      if (this._viewCache[sKey]) {
        oNavContainer.to(this._viewCache[sKey]);
        // Ensure mode + filter are propagated when switching back to a cached view
        var oController = this._viewCache[sKey].getController();
        var oModeModel = this.getOwnerComponent().getModel("viewMode");
        var sMode = oModeModel.getProperty("/mode");
        var sPkg = oModeModel.getProperty("/packageFilter");
        if (oController && typeof oController.onModeChange === "function") {
          oController.onModeChange(sMode);
        }
        if (oController && typeof oController.onPackageFilterChange === "function") {
          oController.onPackageFilterChange(sPkg);
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
