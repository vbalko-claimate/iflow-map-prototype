sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Item",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, Item, GraphUtils) {
  "use strict";

  var MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

  // Mermaid shape syntax per nodeType
  // [text] = rect, ((text)) = circle, {text} = diamond, [(text)] = stadium, ([text]) = rounded
  var MM_SHAPE = {
    iflow:          function (id, label) { return id + "[\"" + label + "\"]"; },
    contact:        function (id, label) { return id + "((\"" + label + "\"))"; },
    partner:        function (id, label) { return id + "{\"" + label + "\"}"; },
    partnerChannel: function (id, label) { return id + "[(\"" + label + "\")]"; },
    bizObject:      function (id, label) { return id + "([\"" + label + "\"])"; },
    bizCapability:  function (id, label) { return id + "([\"" + label + "\"])"; },
    certificate:    function (id, label) { return id + "[\"" + label + "\"]"; }
  };

  return Controller.extend("iflow.map.prototype.controller.Mermaid", {
    onInit: function () {
      this._rendered = false;
      this._mermaidLoaded = false;
      this._selectedKey = "";
      this._graphData = null;
      this._contextGraphData = null;
      this._impactVisited = null;
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

        that._populateSelect();

        var oModeModel = that.getView().getModel("viewMode");
        if (oModeModel) {
          that._mode = oModeModel.getProperty("/mode") || "connection";
          that._packageFilter = oModeModel.getProperty("/packageFilter") || "ALL";
          that._deploymentFilter = oModeModel.getProperty("/deploymentFilter") || "ALL";
        }

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
          that._mermaidLoaded = true;
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
      this._impactVisited = null;
      if (this._mermaidLoaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    onPackageFilterChange: function (sPackageId) {
      this._packageFilter = sPackageId || "ALL";
      this._impactVisited = null;
      if (this._mermaidLoaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    onDeploymentFilterChange: function (sFilter) {
      this._deploymentFilter = sFilter || "ALL";
      this._impactVisited = null;
      if (this._mermaidLoaded) {
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
        this._renderContextMermaid();
      } else {
        this._renderMermaid();
      }
    },

    _populateSelect: function () {
      var oSelect = this.byId("mmIflowSelect");
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
      var oSelect = this.byId("mmIflowSelect");
      var aItems = oSelect.getItems();
      for (var i = 0; i < aItems.length; i++) {
        if (aItems[i].getKey() === sKey) {
          this._selectedKey = sKey;
          oSelect.setSelectedKey(sKey);
          return;
        }
      }
    },

    onDownstreamPress: function () { this._runImpact("downstream"); },
    onUpstreamPress: function () { this._runImpact("upstream"); },

    _runImpact: function (sDirection) {
      if (!this._selectedKey) { return; }
      var data = this._getActiveData();
      if (!data) { return; }
      this._impactVisited = GraphUtils.bfsImpact(
        data.nodes, data.edges, this._selectedKey, sDirection
      );
      this._renderCurrentMode();
    },

    onResetHighlightPress: function () {
      this._impactVisited = null;
      this._renderCurrentMode();
    },

    _sanitizeId: function (sId) {
      return sId.replace(/[^a-zA-Z0-9_]/g, "_");
    },

    // ── Connection mode definition ─────────────────────────────────
    _buildDefinition: function () {
      var that = this;
      var visited = this._impactVisited;
      var data = this._getActiveData();
      var lines = ["graph LR"];

      lines.push("  classDef default fill:#d9e7f7,stroke:#5b738b,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef impacted fill:#0057a3,stroke:#0057a3,color:#fff,stroke-width:2px");
      lines.push("  classDef muted fill:#d5dadd,stroke:#8d9baa,color:#5a6773,stroke-width:1px");
      lines.push("  classDef external fill:#ebedef,stroke:#a0a8b0,color:#6b7785,stroke-width:2px,stroke-dasharray:4 3");
      lines.push("  classDef notDeployed fill:#f5f5f5,stroke:#b0bec5,color:#78909c,stroke-width:2px,stroke-dasharray:4 3");

      data.nodes.forEach(function (n) {
        var safeId = that._sanitizeId(n.key);
        lines.push("  " + safeId + "[\"" + n.name + "<br/><small>" + n.runtimeStatus + "</small>\"]");
      });

      var edgeIndex = 0;
      var linkStyles = [];
      data.edges.forEach(function (e) {
        var srcId = that._sanitizeId(e.source);
        var tgtId = that._sanitizeId(e.target);
        var arrow = e.connectionType === "JMS" ? "-.->" : "-->";
        var label = e.connectionType;
        lines.push("  " + srcId + " " + arrow + "|" + label + "| " + tgtId);

        var edgeColor = e.color;
        if (visited && !(visited[e.source] && visited[e.target])) {
          edgeColor = GraphUtils.MUTED_COLOR;
        }
        linkStyles.push("  linkStyle " + edgeIndex + " stroke:" + edgeColor + ",stroke-width:2.5px");
        edgeIndex++;
      });

      if (visited) {
        data.nodes.forEach(function (n) {
          var safeId = that._sanitizeId(n.key);
          if (visited[n.key]) {
            lines.push("  class " + safeId + " impacted");
          } else {
            lines.push("  class " + safeId + " muted");
          }
        });
      } else {
        // Apply external / notDeployed class when not in impact mode
        data.nodes.forEach(function (n) {
          if (n._isExternal) {
            lines.push("  class " + that._sanitizeId(n.key) + " external");
          } else if (n.runtimeStatus === "NOT_DEPLOYED") {
            lines.push("  class " + that._sanitizeId(n.key) + " notDeployed");
          }
        });
      }

      return lines.concat(linkStyles).join("\n");
    },

    // ── Context mode definition ────────────────────────────────────
    _buildContextDefinition: function () {
      var that = this;
      var visited = this._impactVisited;
      var data = this._getActiveData();
      var lines = ["graph LR"];

      // classDefs
      lines.push("  classDef default fill:#d9e7f7,stroke:#5b738b,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef impacted fill:#0057a3,stroke:#0057a3,color:#fff,stroke-width:2px");
      lines.push("  classDef muted fill:#d5dadd,stroke:#8d9baa,color:#5a6773,stroke-width:1px");
      lines.push("  classDef missingOwner fill:#fff3e0,stroke:#e65100,color:#1f2d3d,stroke-width:3px");
      lines.push("  classDef contactNode fill:#e8f5e9,stroke:#43a047,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef partnerNode fill:#fff3e0,stroke:#e65100,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef channelNode fill:#fce4ec,stroke:#c62828,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef bizObjNode fill:#f3e5f5,stroke:#7b1fa2,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef bizCapNode fill:#e8eaf6,stroke:#283593,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef certNode fill:#fff8e1,stroke:#f9a825,color:#1f2d3d,stroke-width:2px");
      lines.push("  classDef external fill:#ebedef,stroke:#a0a8b0,color:#6b7785,stroke-width:2px,stroke-dasharray:4 3");
      lines.push("  classDef notDeployed fill:#f5f5f5,stroke:#b0bec5,color:#78909c,stroke-width:2px,stroke-dasharray:4 3");

      // Group by type into subgraphs
      var nodesByType = {};
      data.nodes.forEach(function (n) {
        var t = n.nodeType;
        if (!nodesByType[t]) { nodesByType[t] = []; }
        nodesByType[t].push(n);
      });

      var subgraphLabels = {
        iflow: "Integration Flows",
        contact: "Contacts",
        partner: "Partners",
        partnerChannel: "Partner Channels",
        bizObject: "Business Objects",
        bizCapability: "Business Capabilities",
        certificate: "Certificates"
      };

      var nodeTypeClassMap = {
        contact: "contactNode",
        partner: "partnerNode",
        partnerChannel: "channelNode",
        bizObject: "bizObjNode",
        bizCapability: "bizCapNode",
        certificate: "certNode"
      };

      var shapeFn;
      Object.keys(subgraphLabels).forEach(function (nt) {
        var arr = nodesByType[nt] || [];
        if (arr.length === 0) { return; }
        lines.push("  subgraph " + subgraphLabels[nt]);
        shapeFn = MM_SHAPE[nt] || MM_SHAPE.iflow;
        arr.forEach(function (n) {
          var safeId = that._sanitizeId(n.key);
          var label = n.name || n.label;
          if (nt === "iflow") {
            label = label + "<br/><small>" + (n.runtimeStatus || "") + "</small>";
          }
          lines.push("    " + shapeFn(safeId, label));
        });
        lines.push("  end");
      });

      // Edges
      var edgeIndex = 0;
      var linkStyles = [];
      data.edges.forEach(function (e) {
        var srcId = that._sanitizeId(e.source);
        var tgtId = that._sanitizeId(e.target);
        var isDashed = (e.edgeType === "JMS" || e.edgeType === "CONTACT_ASSIGNMENT");
        var arrow = isDashed ? "-.->" : "-->";
        var label = e.edgeType;
        if (e.edgeType === "CONTACT_ASSIGNMENT") { label = e.notes || "Contact"; }
        if (e.edgeType === "OBJECT_ASSIGNMENT") { label = e.notes || "Object"; }
        lines.push("  " + srcId + " " + arrow + "|" + label + "| " + tgtId);

        var edgeColor = e.color;
        if (visited && !(visited[e.source] && visited[e.target])) {
          edgeColor = GraphUtils.MUTED_COLOR;
        }
        linkStyles.push("  linkStyle " + edgeIndex + " stroke:" + edgeColor + ",stroke-width:2px");
        edgeIndex++;
      });

      // Apply classes
      data.nodes.forEach(function (n) {
        var safeId = that._sanitizeId(n.key);
        if (visited) {
          if (visited[n.key]) {
            lines.push("  class " + safeId + " impacted");
          } else {
            lines.push("  class " + safeId + " muted");
          }
        } else {
          // Apply type class
          if (n._isExternal) {
            lines.push("  class " + safeId + " external");
          } else if (that._missingOwnership[n.key]) {
            lines.push("  class " + safeId + " missingOwner");
          } else if (n.nodeType === "iflow" && n.runtimeStatus === "NOT_DEPLOYED") {
            lines.push("  class " + safeId + " notDeployed");
          } else if (nodeTypeClassMap[n.nodeType]) {
            lines.push("  class " + safeId + " " + nodeTypeClassMap[n.nodeType]);
          }
        }
      });

      return lines.concat(linkStyles).join("\n");
    },

    // ── Connection mode render ─────────────────────────────────────
    _renderMermaid: function () {
      var container = document.getElementById("mermaidContainer");
      if (!container || !window.mermaid) { return; }

      var definition = this._buildDefinition();
      var that = this;

      container.innerHTML = "";
      var uniqueId = "mermaid-" + Date.now();

      window.mermaid.render(uniqueId, definition).then(function (result) {
        container.innerHTML = result.svg;
        that._attachMermaidClickHandlers(container, that._getActiveData());
      }).catch(function (err) {
        container.innerHTML = "<p style='color:red'>Mermaid render error: " + err.message + "</p>";
      });
    },

    // ── Context mode render ────────────────────────────────────────
    _renderContextMermaid: function () {
      var container = document.getElementById("mermaidContainer");
      if (!container || !window.mermaid) { return; }

      var definition = this._buildContextDefinition();
      var that = this;

      container.innerHTML = "";
      var uniqueId = "mermaid-ctx-" + Date.now();

      window.mermaid.render(uniqueId, definition).then(function (result) {
        container.innerHTML = result.svg;
        that._attachMermaidClickHandlers(container, that._getActiveData());
      }).catch(function (err) {
        container.innerHTML = "<p style='color:red'>Mermaid render error: " + err.message + "</p>";
      });
    },

    _attachMermaidClickHandlers: function (container, graphData) {
      var that = this;
      container.querySelectorAll(".node").forEach(function (el) {
        el.style.cursor = "pointer";
        el.addEventListener("click", function () {
          var nodeId = el.id || "";
          var matchNode = graphData.nodes.find(function (n) {
            return that._sanitizeId(n.key) === nodeId ||
                   nodeId.indexOf(that._sanitizeId(n.key)) >= 0;
          });
          if (matchNode) {
            GraphUtils.showNodeDetail(matchNode);
            that._selectNode(matchNode.key);
          }
        });
      });
    }
  });
});
