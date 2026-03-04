sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Item",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, Item, GraphUtils) {
  "use strict";

  var CY_CDN = "https://cdn.jsdelivr.net/npm/cytoscape@3/dist/cytoscape.min.js";

  return Controller.extend("iflow.map.prototype.controller.Cytoscape", {
    onInit: function () {
      this._rendered = false;
      this._selectedKey = "";
      this._graphData = null;
      this._cy = null;
    },

    onAfterRendering: function () {
      if (this._rendered) { return; }
      this._rendered = true;
      var that = this;

      var oRawModel = this.getView().getModel("raw");
      var fnLoad = function (oRaw) {
        that._graphData = GraphUtils.buildGraphStructure(oRaw);
        that._populateSelect();
        GraphUtils.loadScript(CY_CDN, "cytoscape").then(function () {
          that._renderCytoscape();
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

    _populateSelect: function () {
      var oSelect = this.byId("cyIflowSelect");
      this._graphData.iflowOptions.forEach(function (opt) {
        oSelect.addItem(new Item({ key: opt.key, text: opt.text }));
      });
      if (this._graphData.iflowOptions.length) {
        this._selectedKey = this._graphData.iflowOptions[0].key;
        oSelect.setSelectedKey(this._selectedKey);
      }
    },

    onSelectedIflowChange: function (oEvent) {
      this._selectedKey = oEvent.getSource().getSelectedKey();
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
        var id = (node.data("iflowId") || "").toLowerCase();
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
      if (!this._selectedKey || !this._graphData || !this._cy) { return; }
      var visited = GraphUtils.bfsImpact(
        this._graphData.nodes, this._graphData.edges, this._selectedKey, sDirection
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

    _renderCytoscape: function () {
      var container = document.getElementById("cyContainer");
      if (!container || !window.cytoscape) { return; }

      var elements = [];

      this._graphData.nodes.forEach(function (n) {
        elements.push({
          data: {
            id: n.key,
            label: n.name,
            name: n.name,
            iflowId: n.id,
            version: n.version,
            runtimeStatus: n.runtimeStatus,
            packageId: n.packageId
          }
        });
      });

      this._graphData.edges.forEach(function (e) {
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

      var that = this;
      cy.on("tap", "node", function (evt) {
        var data = evt.target.data();
        GraphUtils.showNodeDetail({
          name: data.name,
          id: data.iflowId,
          version: data.version,
          runtimeStatus: data.runtimeStatus
        });
      });

      cy.on("tap", "edge", function (evt) {
        var data = evt.target.data();
        GraphUtils.showEdgeDetail({
          connectionType: data.connectionType,
          source: data.source,
          target: data.target,
          notes: data.notes
        });
      });

      this._cy = cy;
    }
  });
});
