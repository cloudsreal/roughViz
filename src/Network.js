import { csv, tsv, json } from "d3-fetch";
import { mouse, select, selectAll } from "d3-selection";
import rough from "roughjs/bundled/rough.esm.js";
import Chart from "./Chart";
import { colors } from "./utils/colors";
import { addLegend } from "./utils/addLegend";
import { roughCeiling } from "./utils/roughCeiling";
import { min, max } from "d3-array";
import { scaleLinear } from "d3-scale";
import {
  forceSimulation,
  forceCollide,
  forceCenter,
  forceLink,
} from "d3-force";

class Network extends Chart {
  constructor(opts) {
    super(opts);
    // load in arguments from config object
    this.data = opts.data;
    this.links = opts.links;
    this.margin = opts.margin || { top: 50, right: 20, bottom: 10, left: 20 };
    this.colors = opts.colors || colors;
    this.highlight = opts.highlight;
    this.roughness = roughCeiling({
      roughness: opts.roughness,
      ceiling: 30,
      defaultValue: 0,
    });
    this.strokeWidth = opts.strokeWidth || 0.75;
    this.innerStrokeWidth = opts.innerStrokeWidth || 0.75;
    this.fillWeight = opts.fillWeight || 0.85;
    this.color = opts.color || "skyblue";
    this.collision = opts.collision || 1.4;
    this.radiusExtent = opts.radiusExtent || [5, 20];
    this.radius = opts.radius || "radius";
    const defaultTextCallback = (d) => "";
    this.textCallback = opts.textCallback || defaultTextCallback;
    const defaultColorCallback = (d) => this.color;
    this.colorCallback = opts.colorCallback || defaultColorCallback;
    this.roughnessExtent = opts.roughnessExtent || [0, 10];
    this.responsive = true;
    this.boundRedraw = this.redraw.bind(this, opts);
    this.legend = opts.legend || false;
    this.legendPosition = opts.legendPosition || "right";
    // new width
    this.initChartValues(opts);
    // resolve font
    this.resolveFont();
    // create the chart
    this.drawChart = this.resolveData(opts.data, opts.links);
    this.drawChart();
    if (opts.title !== "undefined") this.setTitle(opts.title);
  }

  resizeHandler() {
    if (this.responsive) {
      this.boundRedraw();
    }
  }

  remove() {
    select(this.el).select("svg").remove();
  }

  redraw(opts) {
    // 1. Remove the current SVG associated with the chart.
    this.remove();

    // 2. Recalculate the size of the container.
    this.initChartValues(opts);

    // 3. Redraw everything.
    this.resolveFont();
    this.drawChart = this.resolveData(opts.data, opts.links);
    this.drawChart();

    if (opts.title !== "undefined") {
      this.setTitle(opts.title);
    }
  }

  initChartValues(opts) {
    this.roughness = opts.roughness || this.roughness;
    this.collision = opts.collision || this.collision;
    this.color = opts.color || this.color;
    this.stroke = opts.stroke || this.stroke;
    this.strokeWidth = opts.strokeWidth || this.strokeWidth;
    this.axisStrokeWidth = opts.axisStrokeWidth || this.axisStrokeWidth;
    this.axisRoughness = opts.axisRoughness || this.axisRoughness;
    this.innerStrokeWidth = opts.innerStrokeWidth || this.innerStrokeWidth;
    this.fillWeight = opts.fillWeight || this.fillWeight;
    this.fillStyle = opts.fillStyle || this.fillStyle;
    this.title = opts.title || this.title;
    const defaultTextCallback = (d) => "";
    this.textCallback = opts.textCallback || defaultTextCallback;
    const divDimensions = select(this.el).node().getBoundingClientRect();
    const width = divDimensions.width;
    const height = divDimensions.height;
    this.width = width - this.margin.left - this.margin.right;
    this.height = height - this.margin.top - this.margin.bottom;
    this.roughId = this.el + "_svg";
    this.graphClass = this.el.substring(1, this.el.length);
    this.interactionG = "g." + this.graphClass;
    this.setSvg();
  }

  // add this to abstract base
  resolveData(data, links) {
    return () => {
      this.data = data;
      this.links = links;
      this.drawFromObject();
    };
  }

  setTitle(title) {
    this.svg
      .append("text")
      .attr("x", this.width / 2)
      .attr("y", 0 - this.margin.top / 3)
      .attr("class", "title")
      .attr("text-anchor", "middle")
      .style(
        "font-size",
        this.titleFontSize === undefined
          ? `${Math.min(40, Math.min(this.width, this.height) / 4)}px`
          : this.titleFontSize
      )
      .style("font-family", this.fontFamily)
      .style("opacity", 0.8)
      .text(title);
  }

  addInteraction() {
    const that = this;
    let thisColor;

    let mouseleave = function (d) {
      select(this).selectAll("path:nth-child(1)").style("opacity", 1);
      select(this).selectAll("path:nth-child(1)").style("stroke", thisColor);
      select(this)
        .selectAll("path:nth-child(2)")
        .style("stroke-width", that.innerStrokeWidth);

      select(this).select(".node-text").attr("opacity", 0);
    };

    let mouseover = function (d) {
      select(this).raise();
      thisColor = select(this).selectAll("path").style("stroke");
      that.highlight === undefined
        ? select(this).selectAll("path:nth-child(1)").style("opacity", 0.4)
        : select(this)
            .selectAll("path:nth-child(1)")
            .style("stroke", that.highlight);
      select(this)
        .selectAll("path:nth-child(2)")
        .style("stroke-width", that.strokeWidth + 1.2);

      select(this).select(".node-text").attr("opacity", 1);
    };

    // selectAll(this.interactionG).on("mousemove", mousemove);
    selectAll(".nodeGroup")
      .on("mouseover", mouseover)
      .on("mouseleave", mouseleave);
  }

  initRoughObjects() {
    this.roughSvg = document.getElementById(this.roughId);
    this.rcAxis = rough.svg(this.roughSvg, {
      options: { strokeWidth: this.strokeWidth >= 3 ? 3 : this.strokeWidth },
    });
    this.rc = rough.svg(this.roughSvg, {
      options: {
        strokeWidth: this.innerStrokeWidth,
        fill: this.color,
        stroke: this.stroke === "none" ? undefined : this.stroke,
        roughness: this.roughness,
        bowing: this.bowing,
        fillStyle: this.fillStyle,
      },
    });
  }

  drawFromObject() {
    const that = this;
    let radiusScale;
    let roughnessScale;

    if (typeof this.radius === "number") {
      radiusScale = scaleLinear()
        .domain([0, 1])
        .range([this.extent[0], this.radiusExtent[1]]);
    } else {
      const dataMin = min(this.data, (d) => +d[this.radius]);
      const dataMax = max(this.data, (d) => +d[this.radius]);

      // Create a scale based on data's min and max values
      radiusScale = scaleLinear()
        .domain([dataMin, dataMax])
        .range([this.radiusExtent[0], this.radiusExtent[1]]);
    }

    if (typeof this.roughness === "number") {
      roughnessScale = scaleLinear()
        .domain([0, 1])
        .range([this.roughnessExtent[0], this.roughnessExtent[1]]);
    } else {
      const roughnessMin = min(this.data, (d) => +d[this.radius]);
      const roughnessMax = max(this.data, (d) => +d[this.radius]);

      // Create a scale based on data's min and max values
      roughnessScale = scaleLinear()
        .domain([roughnessMin, roughnessMax])
        .range([this.roughnessExtent[0], this.roughnessExtent[1]]);
    }

    this.initRoughObjects();

    const linkElements = this.svg
      .selectAll(".link")
      .data(this.links)
      .enter()
      .append("line")
      .attr("class", "link");

    const nodeGroups = this.svg
      .selectAll(".nodeGroup")
      .data(this.data)
      .enter()
      .append("g")
      .attr("class", "nodeGroup");

    nodeGroups.each(function (d, i) {
      const nodeRadius =
        typeof that.radius === "number"
          ? that.radius
          : radiusScale(d[that.radius]);

      const nodeRoughness =
        typeof that.roughness === "number"
          ? that.roughness
          : roughnessScale(d[that.roughness]);

      const node = that.rc.circle(0, 0, nodeRadius, {
        fill: that.colorCallback(d),
        simplification: that.simplification,
        fillWeight: that.fillWeight,
        roughness: nodeRoughness,
      });

      this.appendChild(node);

      node.setAttribute("class", that.graphClass + "_node");

      select(this)
        .append("circle")
        .attr("class", "node-circle")
        .attr("r", nodeRadius * 0.5)
        .attr("fill", "transparent")
        .attr("stroke", "black");

      select(this)
        .append("text")
        .attr("class", "node-text")
        .attr("x", 0)
        .attr("y", -10) // Adjust 15 based on your needs
        .attr("text-anchor", "middle")
        .style("pointer-events", "none")
        .attr("stroke", "black")
        .attr("fill", "white")
        .attr("stroke-linejoin", "fill")
        .attr("paint-order", "stroke fill")
        .attr("stroke-width", "5px")
        .attr("opacity", 0)
        .text((d) => that.textCallback(d));
    });

    const simulation = forceSimulation(this.data);
    simulation.alpha(1).restart();

    simulation
      .force(
        "collide",
        forceCollide().radius((d) => d.radius * this.collision)
      )
      .force("center", forceCenter(this.width / 2, this.height / 2))
      .force("link", forceLink(this.links).distance(100));
    simulation.on("tick", () => {
      nodeGroups.attr("transform", (d) => `translate(${d.x}, ${d.y})`);
      linkElements
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
    });

    selectAll(".nodeGroup")
      .selectAll("path:nth-child(2)")
      .style("stroke-width", this.strokeWidth);

    if (this.interactive === true) {
      this.addInteraction();
    }

    if (this.legend) {
      const legendItems = this.legend;
      this.colors = this.legend.map((item) => item.color);

      const legendWidth =
        legendItems.reduce(
          (pre, cur) => (pre > cur.text.length ? pre : cur.text.length),
          0
        ) *
          6 +
        35;
      const legendHeight = legendItems.length * 11 + 8;

      addLegend(this, legendItems, legendWidth, legendHeight);
    }
  }
}

export default Network;