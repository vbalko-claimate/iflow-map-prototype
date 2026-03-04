sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Item",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, Item, GraphUtils) {
  "use strict";

  var D3_CDN = "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js";

  return Controller.extend("iflow.map.prototype.controller.D3Force", {
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
        GraphUtils.loadScript(D3_CDN, "d3").then(function () {
          that._renderD3Graph();
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
      var oSelect = this.byId("d3IflowSelect");
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
          return !visited ? 1 : (visited[d.source.key] && visited[d.target.key] ? 1 : 0.08);
        });
    },

    _renderD3Graph: function () {
      var d3 = window.d3;
      var container = document.getElementById("d3GraphContainer");
      if (!container || !d3) { return; }

      container.innerHTML = "";
      var width = container.clientWidth || 900;
      var height = 700;

      var svg = d3.select(container).append("svg")
        .attr("width", width)
        .attr("height", height);

      // Arrow markers for each connection type
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

      // Zoom
      svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", function (event) {
        g.attr("transform", event.transform);
      }));

      var nodes = this._graphData.nodes.map(function (n) {
        return Object.assign({}, n);
      });
      var edges = this._graphData.edges.map(function (e) {
        return { source: e.source, target: e.target, connectionType: e.connectionType, color: e.color, notes: e.notes, id: e.id };
      });

      var simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edges).id(function (d) { return d.key; }).distance(160))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(60));

      // Links
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

      // Node groups
      var nodeG = g.selectAll(".d3-node")
        .data(nodes)
        .enter().append("g")
        .attr("class", "d3-node")
        .style("cursor", "pointer")
        .on("click", function (event, d) {
          GraphUtils.showNodeDetail(d);
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
        .attr("fill", "#d9e7f7")
        .attr("stroke", "#5b738b")
        .attr("stroke-width", 2);

      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-0.2em")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .attr("fill", "#1f2d3d")
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
    }
  });
});
