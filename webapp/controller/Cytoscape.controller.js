sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Item",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, Item, GraphUtils) {
  "use strict";

  var CY_CDN = "https://cdn.jsdelivr.net/npm/cytoscape@3/dist/cytoscape.min.js";

  // Cytoscape shape mapping per nodeType
  var CY_SHAPES = {
    iflow:          "round-rectangle",
    contact:        "ellipse",
    partner:        "diamond",
    partnerChannel: "hexagon",
    bizObject:      "barrel",
    bizCapability:  "round-rectangle",
    certificate:    "rectangle"
  };

  return Controller.extend("iflow.map.prototype.controller.Cytoscape", {
    onInit: function () {
      this._rendered = false;
      this._cyLoaded = false;
      this._selectedKey = "";
      this._graphData = null;
      this._contextGraphData = null;
      this._cy = null;
      this._mode = "connection";
      this._packageFilter = "ALL";
      this._deploymentFilter = "ALL";
      this._missingOwnership = {};
      this._rawData = null;
    },

    onAfterRendering: function () {
      if (this._rendered) { return; }
      this._rendered = true;
      var that = this;

      var oRawModel = this.getView().getModel("raw");
      var fnLoad = function (oRaw) {
        that._rawData = oRaw;
        that._graphData = GraphUtils.buildGraphStructure(oRaw);
        that._contextGraphData = GraphUtils.buildContextGraphStructure(oRaw);
        var aMissing = GraphUtils.checkMissingOwnership(oRaw);
        that._missingOwnership = {};
        aMissing.forEach(function (m) { that._missingOwnership[m.iflowKey] = m; });

        var oModeModel = that.getView().getModel("viewMode");
        if (oModeModel) {
          that._mode = oModeModel.getProperty("/mode") || "connection";
          that._packageFilter = oModeModel.getProperty("/packageFilter") || "ALL";
          that._deploymentFilter = oModeModel.getProperty("/deploymentFilter") || "ALL";
        }

        that._populateSelect();

        GraphUtils.loadScript(CY_CDN, "cytoscape").then(function () {
          that._cyLoaded = true;
          that._renderCurrentMode();
        });
      };

      var oRaw = oRawModel.getData();
      if (oRaw && oRaw.iflows) {
        fnLoad(oRaw);
      } else {
        oRawModel.attachRequestCompleted(function (oEvent) {
          if (oEvent.getParameter("success")) {
            fnLoad(oRawModel.getData());
          }
        });
      }
    },

    onModeChange: function (sMode) {
      this._mode = sMode;
      if (this._cyLoaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    onPackageFilterChange: function (sPackageId) {
      this._packageFilter = sPackageId || "ALL";
      if (this._cyLoaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    onDeploymentFilterChange: function (sFilter) {
      this._deploymentFilter = sFilter || "ALL";
      if (this._cyLoaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    _getActiveData: function () {
      var data = this._mode === "context" ? this._contextGraphData : this._graphData;
      var filtered = GraphUtils.filterGraphByPackage(data, this._packageFilter);
      return GraphUtils.filterGraphByDeployment(filtered, this._deploymentFilter);
    },

    _renderCurrentMode: function () {
      if (this._mode === "context") {
        this._renderContextCytoscape();
      } else {
        this._renderCytoscape();
      }
    },

    _populateSelect: function () {
      var oSelect = this.byId("cyIflowSelect");
      oSelect.removeAllItems();
      var data = this._getActiveData();
      data.iflowOptions.forEach(function (opt) {
        oSelect.addItem(new Item({ key: opt.key, text: opt.text }));
      });
      if (data.iflowOptions.length) {
        this._selectedKey = data.iflowOptions[0].key;
        oSelect.setSelectedKey(this._selectedKey);
      } else {
        this._selectedKey = "";
      }
    },

    onSelectedIflowChange: function (oEvent) {
      this._selectedKey = oEvent.getSource().getSelectedKey();
    },

    _selectNode: function (sKey) {
      var oSelect = this.byId("cyIflowSelect");
      var aItems = oSelect.getItems();
      for (var i = 0; i < aItems.length; i++) {
        if (aItems[i].getKey() === sKey) {
          this._selectedKey = sKey;
          oSelect.setSelectedKey(sKey);
          return;
        }
      }
    },

    onSearch: function (oEvent) {
      var sQuery = (oEvent.getParameter("query") || "").toLowerCase();
      if (!this._cy) { return; }

      if (!sQuery) {
        this._cy.elements().removeClass("muted highlighted");
        return;
      }

      this._cy.nodes().forEach(function (node) {
        var name = (node.data("name") || "").toLowerCase();
        var id = (node.data("iflowId") || node.data("id") || "").toLowerCase();
        if (name.indexOf(sQuery) >= 0 || id.indexOf(sQuery) >= 0) {
          node.removeClass("muted").addClass("highlighted");
        } else {
          node.removeClass("highlighted").addClass("muted");
        }
      });

      this._cy.edges().forEach(function (edge) {
        var src = edge.source();
        var tgt = edge.target();
        if (src.hasClass("highlighted") || tgt.hasClass("highlighted")) {
          edge.removeClass("muted");
        } else {
          edge.addClass("muted");
        }
      });
    },

    onDownstreamPress: function () { this._runImpact("downstream"); },
    onUpstreamPress: function () { this._runImpact("upstream"); },

    _runImpact: function (sDirection) {
      if (!this._selectedKey || !this._cy) { return; }
      var data = this._getActiveData();
      if (!data) { return; }

      var visited = GraphUtils.bfsImpact(
        data.nodes, data.edges, this._selectedKey, sDirection
      );

      this._cy.nodes().forEach(function (node) {
        if (visited[node.id()]) {
          node.removeClass("muted").addClass("impacted");
        } else {
          node.removeClass("impacted").addClass("muted");
        }
      });

      this._cy.edges().forEach(function (edge) {
        if (visited[edge.source().id()] && visited[edge.target().id()]) {
          edge.removeClass("muted");
        } else {
          edge.addClass("muted");
        }
      });
    },

    onResetHighlightPress: function () {
      if (!this._cy) { return; }
      this._cy.elements().removeClass("muted impacted highlighted");
    },

    // ── Connection mode render (original) ──────────────────────────
    _renderCytoscape: function () {
      var container = document.getElementById("cyContainer");
      if (!container || !window.cytoscape) { return; }

      if (this._cy) { this._cy.destroy(); this._cy = null; }

      var data = this._getActiveData();
      var elements = [];

      data.nodes.forEach(function (n) {
        elements.push({
          data: {
            id: n.key,
            label: n.name,
            name: n.name,
            iflowId: n.id,
            version: n.version,
            runtimeStatus: n.runtimeStatus,
            packageId: n.packageId,
            isExternal: !!n._isExternal,
            isNotDeployed: n.runtimeStatus === "NOT_DEPLOYED"
          }
        });
      });

      data.edges.forEach(function (e) {
        elements.push({
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
            connectionType: e.connectionType,
            color: e.color,
            notes: e.notes
          }
        });
      });

      var cy = window.cytoscape({
        container: container,
        elements: elements,
        style: [
          {
            selector: "node",
            style: {
              "label": "data(label)",
              "background-color": "#d9e7f7",
              "border-color": "#5b738b",
              "border-width": 2,
              "color": "#1f2d3d",
              "text-valign": "center",
              "text-halign": "center",
              "font-size": "11px",
              "font-weight": "600",
              "width": 140,
              "height": 44,
              "shape": "round-rectangle",
              "text-wrap": "wrap",
              "text-max-width": "120px",
              "transition-property": "opacity",
              "transition-duration": "0.3s"
            }
          },
          {
            selector: "edge",
            style: {
              "width": 2.5,
              "line-color": "data(color)",
              "target-arrow-color": "data(color)",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              "transition-property": "opacity",
              "transition-duration": "0.3s"
            }
          },
          {
            selector: "edge[connectionType='JMS']",
            style: {
              "line-style": "dashed"
            }
          },
          {
            selector: "node[?isNotDeployed]",
            style: {
              "background-color": "#f5f5f5",
              "border-color": "#b0bec5",
              "border-style": "dashed"
            }
          },
          {
            selector: "node[?isExternal]",
            style: {
              "opacity": 0.55,
              "background-color": "#ebedef",
              "border-color": "#a0a8b0",
              "border-style": "dashed"
            }
          },
          {
            selector: ".muted",
            style: { "opacity": 0.15 }
          },
          {
            selector: ".impacted",
            style: {
              "background-color": "#0057a3",
              "color": "#ffffff",
              "border-color": "#0057a3"
            }
          },
          {
            selector: ".highlighted",
            style: {
              "background-color": "#e8f0fe",
              "border-color": "#0a6ed1",
              "border-width": 3
            }
          }
        ],
        layout: {
          name: "cose",
          animate: true,
          animationDuration: 800,
          nodeRepulsion: function () { return 8000; },
          idealEdgeLength: function () { return 160; },
          padding: 40
        }
      });

      var that2 = this;
      cy.on("tap", "node", function (evt) {
        var d = evt.target.data();
        GraphUtils.showNodeDetail({
          name: d.name,
          id: d.iflowId,
          version: d.version,
          runtimeStatus: d.runtimeStatus
        });
        that2._selectNode(evt.target.id());
      });

      cy.on("tap", "edge", function (evt) {
        var d = evt.target.data();
        GraphUtils.showEdgeDetail({
          connectionType: d.connectionType,
          source: d.source,
          target: d.target,
          notes: d.notes
        });
      });

      this._cy = cy;
    },

    // ── Context mode render ────────────────────────────────────────
    _renderContextCytoscape: function () {
      var container = document.getElementById("cyContainer");
      if (!container || !window.cytoscape) { return; }

      if (this._cy) { this._cy.destroy(); this._cy = null; }

      var that = this;
      var data = this._getActiveData();
      var elements = [];

      data.nodes.forEach(function (n) {
        var d = {
          id: n.key,
          label: n.name || n.label,
          name: n.name,
          nodeType: n.nodeType,
          iflowId: n.id,
          version: n.version,
          runtimeStatus: n.runtimeStatus,
          packageId: n.packageId,
          company: n.company,
          email: n.email,
          protocol: n.protocol,
          direction: n.direction,
          certStatus: n.certStatus,
          partnerType: n.partnerType,
          missingOwner: !!that._missingOwnership[n.key],
          isExternal: !!n._isExternal,
          isNotDeployed: n.nodeType === "iflow" && n.runtimeStatus === "NOT_DEPLOYED"
        };
        // Compound: channels belong to their partner (if both are visible)
        if (n.nodeType === "partnerChannel" && n.partnerId && data.nodeMap["partner::" + n.partnerId]) {
          d.parent = "partner::" + n.partnerId;
        }
        elements.push({ data: d });
      });

      data.edges.forEach(function (e) {
        if (e.edgeType === "PARTNER_OWNS_CHANNEL") { return; }
        elements.push({
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
            connectionType: e.connectionType || e.edgeType,
            edgeType: e.edgeType,
            color: e.color,
            notes: e.notes,
            edgeLabel: (e.edgeType === "CONTACT_ASSIGNMENT" || e.edgeType === "OBJECT_ASSIGNMENT") ? (e.notes || e.edgeType) : ""
          }
        });
      });

      var styles = [
        {
          selector: "node",
          style: {
            "label": "data(label)",
            "color": "#1f2d3d",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "10px",
            "font-weight": "600",
            "text-wrap": "wrap",
            "text-max-width": "110px",
            "transition-property": "opacity",
            "transition-duration": "0.3s"
          }
        },
        {
          selector: ":parent",
          style: {
            "background-color": GraphUtils.NODE_TYPE_COLORS.partner,
            "background-opacity": 0.3,
            "border-color": "#e65100",
            "border-width": 2,
            "text-valign": "top",
            "text-halign": "center",
            "font-size": "11px",
            "padding": "16px"
          }
        }
      ];

      Object.keys(CY_SHAPES).forEach(function (nt) {
        styles.push({
          selector: "node[nodeType='" + nt + "']",
          style: {
            "background-color": GraphUtils.NODE_TYPE_COLORS[nt] || "#d9e7f7",
            "border-color": "#5b738b",
            "border-width": 2,
            "shape": CY_SHAPES[nt],
            "width": nt === "iflow" ? 140 : 100,
            "height": nt === "iflow" ? 44 : 36
          }
        });
      });

      styles.push({
        selector: "node[?isNotDeployed]",
        style: { "background-color": "#f5f5f5", "border-color": "#b0bec5", "border-style": "dashed" }
      });
      styles.push({
        selector: "node[?missingOwner]",
        style: { "border-color": "#e65100", "border-width": 4, "border-style": "double" }
      });
      styles.push({
        selector: "node[?isExternal]",
        style: { "opacity": 0.55, "border-style": "dashed", "border-color": "#a0a8b0" }
      });

      styles.push({
        selector: "edge",
        style: {
          "width": 2, "line-color": "data(color)", "target-arrow-color": "data(color)",
          "target-arrow-shape": "triangle", "curve-style": "bezier",
          "transition-property": "opacity", "transition-duration": "0.3s"
        }
      });
      styles.push({
        selector: "edge[edgeType='JMS'], edge[edgeType='CONTACT_ASSIGNMENT']",
        style: { "line-style": "dashed" }
      });
      styles.push({
        selector: "edge[edgeType='CONTACT_ASSIGNMENT'], edge[edgeType='OBJECT_ASSIGNMENT']",
        style: {
          "width": 1.5,
          "label": "data(edgeLabel)",
          "font-size": "8px",
          "text-rotation": "autorotate",
          "text-background-color": "#ffffff",
          "text-background-opacity": 0.8,
          "text-background-padding": "2px",
          "color": "data(color)"
        }
      });
      styles.push({ selector: ".muted", style: { "opacity": 0.15 } });
      styles.push({
        selector: ".impacted",
        style: { "background-color": "#0057a3", "color": "#ffffff", "border-color": "#0057a3" }
      });
      styles.push({
        selector: ".highlighted",
        style: { "background-color": "#e8f0fe", "border-color": "#0a6ed1", "border-width": 3 }
      });

      var cy = window.cytoscape({
        container: container,
        elements: elements,
        style: styles,
        layout: {
          name: "cose", animate: true, animationDuration: 800,
          nodeRepulsion: function () { return 12000; },
          idealEdgeLength: function () { return 120; },
          padding: 40, nestingFactor: 1.2
        }
      });

      var that2 = this;
      cy.on("tap", "node", function (evt) {
        GraphUtils.showNodeDetail(evt.target.data());
        that2._selectNode(evt.target.id());
      });
      cy.on("tap", "edge", function (evt) { GraphUtils.showEdgeDetail(evt.target.data()); });

      this._cy = cy;
    }
  });
});
