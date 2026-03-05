sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Item",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, Item, GraphUtils) {
  "use strict";

  var D3_CDN = "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js";

  // D3 shape config per node type
  var NODE_SHAPES = {
    iflow:          "rect",
    contact:        "circle",
    partner:        "diamond",
    partnerChannel: "diamond",
    bizObject:      "roundedRect",
    bizCapability:  "roundedRect",
    certificate:    "rect"
  };

  return Controller.extend("iflow.map.prototype.controller.D3Force", {
    onInit: function () {
      this._rendered = false;
      this._d3Loaded = false;
      this._selectedKey = "";
      this._graphData = null;
      this._contextGraphData = null;
      this._impactVisited = null;
      this._mode = "connection";
      this._packageFilter = "ALL";
      this._deploymentFilter = "ALL";
      this._entityFilter = "ALL";
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

        // Read current mode + filter
        var oModeModel = that.getView().getModel("viewMode");
        if (oModeModel) {
          that._mode = oModeModel.getProperty("/mode") || "connection";
          that._packageFilter = oModeModel.getProperty("/packageFilter") || "ALL";
          that._deploymentFilter = oModeModel.getProperty("/deploymentFilter") || "ALL";
          that._entityFilter = oModeModel.getProperty("/entityFilter") || "ALL";
        }

        that._populateSelect();

        GraphUtils.loadScript(D3_CDN, "d3").then(function () {
          that._d3Loaded = true;
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
      if (this._d3Loaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    onPackageFilterChange: function (sPackageId) {
      this._packageFilter = sPackageId || "ALL";
      this._impactVisited = null;
      if (this._d3Loaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    onDeploymentFilterChange: function (sFilter) {
      this._deploymentFilter = sFilter || "ALL";
      this._impactVisited = null;
      if (this._d3Loaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    onEntityFilterChange: function (sKey) {
      this._entityFilter = sKey || "ALL";
      this._impactVisited = null;
      if (this._d3Loaded) {
        this._populateSelect();
        this._renderCurrentMode();
      }
    },

    _getActiveData: function () {
      var data = this._mode === "context" ? this._contextGraphData : this._graphData;
      var filtered = GraphUtils.filterGraphByPackage(data, this._packageFilter);
      filtered = GraphUtils.filterGraphByDeployment(filtered, this._deploymentFilter);
      return GraphUtils.filterGraphByEntity(filtered, this._entityFilter, this._rawData);
    },

    _renderCurrentMode: function () {
      if (this._mode === "context") {
        this._renderContextGraph();
      } else {
        this._renderD3Graph();
      }
    },

    _populateSelect: function () {
      var oSelect = this.byId("d3IflowSelect");
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

    _selectNode: function (d) {
      var sKey = d.key;
      var oSelect = this.byId("d3IflowSelect");
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
      this._applyImpactStyles();
    },

    onResetHighlightPress: function () {
      this._impactVisited = null;
      this._applyImpactStyles();
    },

    _applyImpactStyles: function () {
      var visited = this._impactVisited;
      var d3 = window.d3;
      if (!d3) { return; }

      var svg = d3.select("#d3GraphContainer svg");
      if (svg.empty()) { return; }

      svg.selectAll(".d3-node").transition().duration(300)
        .attr("opacity", function (d) {
          return !visited ? 1 : (visited[d.key] ? 1 : 0.15);
        });

      svg.selectAll(".d3-link").transition().duration(300)
        .attr("opacity", function (d) {
          var srcKey = d.source.key || d.source;
          var tgtKey = d.target.key || d.target;
          return !visited ? 1 : (visited[srcKey] && visited[tgtKey] ? 1 : 0.08);
        });
    },

    // ── Connection mode render (original) ──────────────────────────
    _renderD3Graph: function () {
      var d3 = window.d3;
      var container = document.getElementById("d3GraphContainer");
      if (!container || !d3) { return; }
      var that = this;

      container.innerHTML = "";
      var width = container.clientWidth || 900;
      var height = 700;
      var data = this._getActiveData();

      var svg = d3.select(container).append("svg")
        .attr("width", width)
        .attr("height", height);

      var defs = svg.append("defs");
      Object.keys(GraphUtils.COLOR_MAP).forEach(function (type) {
        defs.append("marker")
          .attr("id", "arrow-" + type)
          .attr("viewBox", "0 0 10 10")
          .attr("refX", 20)
          .attr("refY", 5)
          .attr("markerWidth", 8)
          .attr("markerHeight", 8)
          .attr("orient", "auto")
          .append("path")
          .attr("d", "M0,0L10,5L0,10Z")
          .attr("fill", GraphUtils.COLOR_MAP[type]);
      });

      var g = svg.append("g");

      svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", function (event) {
        g.attr("transform", event.transform);
      }));

      var nodes = data.nodes.map(function (n) {
        return Object.assign({}, n);
      });
      var edges = data.edges.map(function (e) {
        return { source: e.source, target: e.target, connectionType: e.connectionType, color: e.color, notes: e.notes, id: e.id };
      });

      var simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edges).id(function (d) { return d.key; }).distance(160))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(60));

      var link = g.selectAll(".d3-link")
        .data(edges)
        .enter().append("line")
        .attr("class", "d3-link")
        .attr("stroke", function (d) { return d.color; })
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", function (d) { return d.connectionType === "JMS" ? "8,4" : null; })
        .attr("marker-end", function (d) { return "url(#arrow-" + d.connectionType + ")"; })
        .style("cursor", "pointer")
        .on("click", function (event, d) {
          GraphUtils.showEdgeDetail(d);
        });

      var nodeG = g.selectAll(".d3-node")
        .data(nodes)
        .enter().append("g")
        .attr("class", "d3-node")
        .style("cursor", "pointer")
        .on("click", function (event, d) {
          GraphUtils.showNodeDetail(d);
          that._selectNode(d);
        })
        .call(d3.drag()
          .on("start", function (event, d) {
            if (!event.active) { simulation.alphaTarget(0.3).restart(); }
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", function (event, d) {
            d.fx = event.x; d.fy = event.y;
          })
          .on("end", function (event, d) {
            if (!event.active) { simulation.alphaTarget(0); }
            d.fx = null; d.fy = null;
          })
        );

      nodeG.append("rect")
        .attr("width", 150)
        .attr("height", 48)
        .attr("x", -75)
        .attr("y", -24)
        .attr("rx", 6)
        .attr("fill", function (d) {
          if (d._isExternal) { return "#ebedef"; }
          if (d.runtimeStatus === "NOT_DEPLOYED") { return "#f5f5f5"; }
          return "#d9e7f7";
        })
        .attr("stroke", function (d) {
          if (d._isExternal) { return "#a0a8b0"; }
          if (d.runtimeStatus === "NOT_DEPLOYED") { return "#b0bec5"; }
          return "#5b738b";
        })
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", function (d) {
          if (d._isExternal || d.runtimeStatus === "NOT_DEPLOYED") { return "4,3"; }
          return null;
        });

      nodeG.attr("opacity", function (d) { return d._isExternal ? 0.55 : 1; });

      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-0.2em")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .attr("fill", function (d) { return d._isExternal ? "#6b7785" : "#1f2d3d"; })
        .text(function (d) { return d.name; });

      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "1.2em")
        .attr("font-size", "10px")
        .attr("fill", "#5b738b")
        .text(function (d) { return d.runtimeStatus; });

      simulation.on("tick", function () {
        link
          .attr("x1", function (d) { return d.source.x; })
          .attr("y1", function (d) { return d.source.y; })
          .attr("x2", function (d) { return d.target.x; })
          .attr("y2", function (d) { return d.target.y; });

        nodeG.attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
      });
    },

    // ── Context mode render ────────────────────────────────────────
    _renderContextGraph: function () {
      var d3 = window.d3;
      var container = document.getElementById("d3GraphContainer");
      if (!container || !d3) { return; }

      container.innerHTML = "";
      var width = container.clientWidth || 900;
      var height = 700;
      var that = this;
      var data = this._getActiveData();

      var svg = d3.select(container).append("svg")
        .attr("width", width)
        .attr("height", height);

      var defs = svg.append("defs");
      Object.keys(GraphUtils.EDGE_TYPE_COLORS).forEach(function (type) {
        defs.append("marker")
          .attr("id", "arrow-" + type)
          .attr("viewBox", "0 0 10 10")
          .attr("refX", 20)
          .attr("refY", 5)
          .attr("markerWidth", 8)
          .attr("markerHeight", 8)
          .attr("orient", "auto")
          .append("path")
          .attr("d", "M0,0L10,5L0,10Z")
          .attr("fill", GraphUtils.EDGE_TYPE_COLORS[type]);
      });

      var g = svg.append("g");

      svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", function (event) {
        g.attr("transform", event.transform);
      }));

      var nodes = data.nodes.map(function (n) {
        return Object.assign({}, n);
      });
      var edges = data.edges.map(function (e) {
        return Object.assign({}, e);
      });

      var simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edges).id(function (d) { return d.key; }).distance(120))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(50));

      var link = g.selectAll(".d3-link")
        .data(edges)
        .enter().append("line")
        .attr("class", "d3-link")
        .attr("stroke", function (d) { return d.color; })
        .attr("stroke-width", function (d) {
          return (d.edgeType === "CONTACT_ASSIGNMENT" || d.edgeType === "OBJECT_ASSIGNMENT") ? 1.5 : 2.5;
        })
        .attr("stroke-dasharray", function (d) {
          if (d.edgeType === "JMS" || d.edgeType === "CONTACT_ASSIGNMENT") { return "6,3"; }
          return null;
        })
        .attr("marker-end", function (d) { return "url(#arrow-" + d.edgeType + ")"; })
        .style("cursor", "pointer")
        .on("click", function (event, d) {
          GraphUtils.showEdgeDetail(d);
        });

      var nodeG = g.selectAll(".d3-node")
        .data(nodes)
        .enter().append("g")
        .attr("class", "d3-node")
        .style("cursor", "pointer")
        .on("click", function (event, d) {
          GraphUtils.showNodeDetail(d);
          that._selectNode(d);
        })
        .call(d3.drag()
          .on("start", function (event, d) {
            if (!event.active) { simulation.alphaTarget(0.3).restart(); }
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", function (event, d) {
            d.fx = event.x; d.fy = event.y;
          })
          .on("end", function (event, d) {
            if (!event.active) { simulation.alphaTarget(0); }
            d.fx = null; d.fy = null;
          })
        );

      nodeG.each(function (d) {
        var el = d3.select(this);
        var fillColor = GraphUtils.NODE_TYPE_COLORS[d.nodeType] || "#d9e7f7";
        var strokeColor = "#5b738b";
        var isMissing = that._missingOwnership[d.key];
        if (isMissing) { strokeColor = "#e65100"; }

        var shape = NODE_SHAPES[d.nodeType] || "rect";

        if (shape === "circle") {
          el.append("circle")
            .attr("r", 24)
            .attr("fill", fillColor)
            .attr("stroke", strokeColor)
            .attr("stroke-width", isMissing ? 3 : 2)
            .attr("class", isMissing ? "ctx-missing-owner" : "");
        } else if (shape === "diamond") {
          el.append("polygon")
            .attr("points", "0,-28 36,0 0,28 -36,0")
            .attr("fill", fillColor)
            .attr("stroke", strokeColor)
            .attr("stroke-width", 2);
        } else if (shape === "roundedRect") {
          el.append("rect")
            .attr("width", 130)
            .attr("height", 40)
            .attr("x", -65)
            .attr("y", -20)
            .attr("rx", 16)
            .attr("fill", fillColor)
            .attr("stroke", strokeColor)
            .attr("stroke-width", 2);
        } else {
          var isUndeployed = d.nodeType === "iflow" && d.runtimeStatus === "NOT_DEPLOYED";
          el.append("rect")
            .attr("width", 150)
            .attr("height", 48)
            .attr("x", -75)
            .attr("y", -24)
            .attr("rx", 6)
            .attr("fill", isUndeployed ? "#f5f5f5" : fillColor)
            .attr("stroke", isMissing ? strokeColor : (isUndeployed ? "#b0bec5" : strokeColor))
            .attr("stroke-width", isMissing ? 3 : 2)
            .attr("stroke-dasharray", isUndeployed && !isMissing ? "4,3" : null)
            .attr("class", isMissing ? "ctx-missing-owner" : "");
        }
      });

      // Dim external nodes
      nodeG.attr("opacity", function (d) { return d._isExternal ? 0.55 : 1; });

      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", function (d) { return d.nodeType === "iflow" ? "12px" : "10px"; })
        .attr("font-weight", "600")
        .attr("fill", "#1f2d3d")
        .text(function (d) {
          var label = d.name || d.label;
          return label.length > 20 ? label.substring(0, 18) + ".." : label;
        });

      nodeG.filter(function (d) { return d.nodeType === "iflow"; })
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "1.6em")
        .attr("font-size", "9px")
        .attr("fill", "#5b738b")
        .text(function (d) { return d.runtimeStatus; });

      // Edge labels for assignment edges (show role name)
      var linkLabel = g.selectAll(".d3-link-label")
        .data(edges.filter(function (e) {
          return e.edgeType === "CONTACT_ASSIGNMENT" || e.edgeType === "OBJECT_ASSIGNMENT";
        }))
        .enter().append("text")
        .attr("class", "d3-link-label")
        .attr("text-anchor", "middle")
        .attr("font-size", "8px")
        .attr("fill", function (d) { return d.color; })
        .attr("pointer-events", "none")
        .text(function (d) { return d.notes || d.edgeType; });

      simulation.on("tick", function () {
        link
          .attr("x1", function (d) { return d.source.x; })
          .attr("y1", function (d) { return d.source.y; })
          .attr("x2", function (d) { return d.target.x; })
          .attr("y2", function (d) { return d.target.y; });

        linkLabel
          .attr("x", function (d) { return (d.source.x + d.target.x) / 2; })
          .attr("y", function (d) { return (d.source.y + d.target.y) / 2 - 4; });

        nodeG.attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
      });
    }
  });
});
