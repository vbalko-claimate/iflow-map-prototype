sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Item",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, Item, GraphUtils) {
  "use strict";

  var MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

  return Controller.extend("iflow.map.prototype.controller.Mermaid", {
    onInit: function () {
      this._rendered = false;
      this._selectedKey = "";
      this._graphData = null;
      this._impactVisited = null;
    },

    onAfterRendering: function () {
      if (this._rendered) { return; }
      this._rendered = true;
      var that = this;

      var oRawModel = this.getView().getModel("raw");
      var fnLoad = function (oRaw) {
        that._graphData = GraphUtils.buildGraphStructure(oRaw);
        that._populateSelect();
        GraphUtils.loadScript(MERMAID_CDN, "mermaid").then(function () {
          window.mermaid.initialize({
            startOnLoad: false,
            theme: "base",
            themeVariables: {
              primaryColor: "#d9e7f7",
              primaryTextColor: "#1f2d3d",
              primaryBorderColor: "#5b738b",
              lineColor: "#0a6ed1",
              fontSize: "14px"
            },
            flowchart: { useMaxWidth: false, htmlLabels: true }
          });
          that._renderMermaid();
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
      var oSelect = this.byId("mmIflowSelect");
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

    onDownstreamPress: function () { this._runImpact("downstream"); },
    onUpstreamPress: function () { this._runImpact("upstream"); },

    _runImpact: function (sDirection) {
      if (!this._selectedKey || !this._graphData) { return; }
      this._impactVisited = GraphUtils.bfsImpact(
        this._graphData.nodes, this._graphData.edges, this._selectedKey, sDirection
      );
      this._renderMermaid();
    },

    onResetHighlightPress: function () {
      this._impactVisited = null;
      this._renderMermaid();
    },

    _sanitizeId: function (sId) {
      return sId.replace(/[^a-zA-Z0-9_]/g, "_");
    },

    _buildDefinition: function () {
      var that = this;
      var visited = this._impactVisited;
      var lines = ["graph LR"];

      // classDefs
      lines.push("  classDef default fill:#d9e7f7,stroke:#5b738b,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef impacted fill:#0057a3,stroke:#0057a3,color:#fff,stroke-width:2px");
      lines.push("  classDef muted fill:#d5dadd,stroke:#8d9baa,color:#5a6773,stroke-width:1px");

      // Nodes
      this._graphData.nodes.forEach(function (n) {
        var safeId = that._sanitizeId(n.key);
        lines.push("  " + safeId + "[\"" + n.name + "<br/><small>" + n.runtimeStatus + "</small>\"]");
      });

      // Edges
      var edgeIndex = 0;
      var linkStyles = [];
      this._graphData.edges.forEach(function (e) {
        var srcId = that._sanitizeId(e.source);
        var tgtId = that._sanitizeId(e.target);
        var arrow = e.connectionType === "JMS" ? "-.->" : "-->";
        var label = e.connectionType;
        lines.push("  " + srcId + " " + arrow + "|" + label + "| " + tgtId);

        // Color the edge
        var edgeColor = e.color;
        if (visited && !(visited[e.source] && visited[e.target])) {
          edgeColor = GraphUtils.MUTED_COLOR;
        }
        linkStyles.push("  linkStyle " + edgeIndex + " stroke:" + edgeColor + ",stroke-width:2.5px");
        edgeIndex++;
      });

      // Apply impact classes
      if (visited) {
        this._graphData.nodes.forEach(function (n) {
          var safeId = that._sanitizeId(n.key);
          if (visited[n.key]) {
            lines.push("  class " + safeId + " impacted");
          } else {
            lines.push("  class " + safeId + " muted");
          }
        });
      }

      return lines.concat(linkStyles).join("\n");
    },

    _renderMermaid: function () {
      var container = document.getElementById("mermaidContainer");
      if (!container || !window.mermaid) { return; }

      var definition = this._buildDefinition();
      var that = this;

      // Clear previous
      container.innerHTML = "";
      var uniqueId = "mermaid-" + Date.now();

      window.mermaid.render(uniqueId, definition).then(function (result) {
        container.innerHTML = result.svg;

        // Attach click events to nodes via event delegation
        container.querySelectorAll(".node").forEach(function (el) {
          el.style.cursor = "pointer";
          el.addEventListener("click", function () {
            var nodeId = el.id || "";
            // Find matching node data
            var matchNode = that._graphData.nodes.find(function (n) {
              return that._sanitizeId(n.key) === nodeId ||
                     nodeId.indexOf(that._sanitizeId(n.key)) >= 0;
            });
            if (matchNode) {
              GraphUtils.showNodeDetail(matchNode);
            }
          });
        });
      }).catch(function (err) {
        container.innerHTML = "<p style='color:red'>Mermaid render error: " + err.message + "</p>";
      });
    }
  });
});
