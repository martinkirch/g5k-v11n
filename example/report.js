var Report = {
  data: null,
  
  svg: null,
  width: 1220,
  height: 600,
  padding: 40,
  nbTicks: 10,
  
  lastRegExpFilter: "",
  
  current: null,
  
  resetSVG: function() {
    if (Report.svg) {
      Report.svg.remove();
    }
    
    Report.svg = d3.select('body').append('svg').attr({
      width: Report.width,
      height: Report.height
    });
  },
  
  preStackMetrics: function(d){
    for (var xpName in d) {
      var xpData = d[xpName];
      var nbBars = null;
      var xStep = null;
      var stacked = [];
      
      d[xpName].stacked_metrics = {};
      
      for (var metric in xpData.metrics) {
        var measures = xpData.metrics[metric];
        var nbBars = null;
        var xStep = null;
        var stacked = [];
        
        for (var node in measures) {
          if (nbBars === null) {
            nbBars = measures[node].length;
            xStep = Math.round( xpData['duration'] / nbBars);
          }

          if (xpData.masters.indexOf(node) < 0) {
            var adjusted = measures[node].map( function(elem,i) {
              return {
                x: i*xStep,
                y: elem,
                node: node
              };
            });

            stacked.push(adjusted);
          }
        }
        
        d3.layout.stack()(stacked);
        
        d[xpName].stacked_metrics[metric] = stacked;
      }  
      
      delete d[xpName].metrics;
    }
    
    return d;
  },
  
  init: function(d) {
    Report.data = Report.preStackMetrics(d);   
    
    var identity = function(name) { return name; };
    
    d3.select("#xpname")
      .selectAll('option')
      .data(Object.getOwnPropertyNames(Report.data))
      .enter()
        .append('option')
        .text(identity)
        .attr('value', identity);
    
    var randomXPid = Object.getOwnPropertyNames(Report.data)[0];
    
    d3.select("#metrics")
      .selectAll('option')
      .data(Object.getOwnPropertyNames(Report.data[randomXPid].stacked_metrics))
      .enter()
        .append('option')
        .text(identity)
        .attr('value', identity);
    
    var counters = Object.getOwnPropertyNames(Report.data[randomXPid].flatjobs);
    counters.unshift("global_duration");
    
    var counter_selectors = d3.select("#counters_selector")
                              .selectAll('div')
                              .data(counters)
                              .enter()
                              .append('div');
    
    counter_selectors.append("input")
      .attr({ type:"checkbox", value: identity, id: identity });
    
    counter_selectors.append("label").attr("for", identity).text(identity);
    
    d3.select("#global_duration").attr("checked", "checked");
    
    Report.draw();
    
    d3.select("#msg_loading").remove();
  },
  
  draw: function() {
    Report.resetSVG();
    
    var selectedFunction = d3.select("input.show:checked").attr("value");
    
    switch(selectedFunction) {
      case "counters":
        var selectedCounters = d3.selectAll("#counters_selector input:checked")[0].map(function(d){return d.value;});
        Report.current = new CountersHistograms(Report.data, Report.readFilter(), selectedCounters);
        break;
      
      case "metrics":
        var metric = document.getElementById('metrics').value;
        var xpName = document.getElementById('xpname').value;
        var monochrome = !d3.select("#monochrome:checked").empty();
        
        Report.current = new StackedHistograms(Report.data[xpName], metric, monochrome);
        break;
      
      default:
        alert("Selected function = "+selectedFunction+"\nWAT");
    }
  },
  
  /***************************************************************************
   * If "Filter" checkbox is selected, prompt user for a regexp and return it
   * otherwise, return null
   */
  readFilter: function() {
    if (!d3.select("#doFilter:checked").empty()) { // aka "if we checked #doFilter"
      var regexp = window.prompt("Keep only XP names matching :", Report.lastRegExpFilter);
      
      if (regexp) {
        Report.lastRegExpFilter = regexp;
        return new RegExp(regexp, "i");
      }
    }
    
    return null;
  },
  
  
  /***************************************************************************
   * Histogram axis - If one scale is null it won't be drawn
   * returns the update(xScale, yScale) function
   * xTitle is optional and requires xScale
   */
  drawAxis: function(xScale, yScale, xTitle) {
    var xAxis = null;
    var xGrid = null;
    
    if (xScale) {
      xAxis = d3.svg.axis().orient('bottom');

  		xGrid = Report.svg.append('g')
  			.classed('axis', true)
  			.attr('transform', 'translate(0,'+ (Report.height - Report.padding + 1)+')');
  		
  		if (xTitle) {
    		xGrid.append('text')
    			.text(xTitle)
    			.attr({x: Report.width/2, y:Report.padding-5, textAnchor: 'middle'});
    	}
    }
    
    
    
    var yAxis = null;
    var yGrid = null;
    
		if (yScale) {
		  yAxis = d3.svg.axis()
  			.tickFormat(d3.format('s'))
  			.orient('left');

  		var yGrid = Report.svg.append('g')
  			.classed('axis', true)
  			.attr('transform', 'translate('+ Report.padding +',0)')
		}
		
		var updater = function(x, y) {
		  if (xAxis) {
		    xGrid.call(xAxis.scale(x));
		  }
		  
		  if (yAxis) {
		    yGrid.call(yAxis.scale(y));
		    
    		var lines = yGrid.selectAll('line.grid')
    		                 .data(y.ticks(Report.nbTicks));
    		
    		lines.exit()
    		     .remove();
    		
    		lines.enter()
    		    .append('line')
    		    .classed('grid', true)
    		    .attr({
    		      x1: 0,
    		      x2: Report.width-2*Report.padding,
    		    });
    		
    		lines.attr({
    		  y1: y,
    		  y2: y
    		});
		  }
		};
		
		updater(xScale, yScale);
		
		return updater;
  },
  
  copy: function() {
  	window.prompt("Hit Ctrl+C, save somewhere, print.", document.body.outerHTML);
  },
  
  print: function() {
    d3.select('header').remove();
    window.print();
  },
  
  small: function() {
    Report.width = Math.floor(Report.width/2);
    Report.height = Math.floor(Report.height/2),
    Report.nbTicks = Math.floor(Report.nbTicks/2),
    Report.draw();
  }
};












/**
 * For each XP in raw_data, plot its counters
 * filter (optional) applies to XP names
 */
function CountersHistograms(raw_data, filter, selectedCounters) {
  var self = this;
  
  this.yMax = 0;
  this.data = this.getData(raw_data, filter, selectedCounters);
  
  this.xScale = d3.scale.ordinal()
                       .domain(d3.range(this.data.length))
                       .rangeBands([Report.padding, Report.width - 2*Report.padding], 0.1);
  
  this.yScale = d3.scale.linear()
                       .domain([0, this.yMax])
                       .range([Report.height - Report.padding, Report.padding]);
  
  this.hScale = d3.scale.linear()
                       .domain([0, this.yMax])
                       .range([0,Report.height - 2*Report.padding]);
  
  this.colorScale = d3.scale.category10().domain(selectedCounters);
  
  this.updateAxisScales = Report.drawAxis(null, this.yScale);
  
  var xpGroups = Report.svg.selectAll("g.xpGroup")
                           .data(this.data);
  
  var xpGroupsEnter = xpGroups.enter().append("g")
            .classed("xpGroup", true)
            .attr("transform", function(d,i) { return "translate("+self.xScale(i)+",0)"; });
  
  var rangeBand = this.xScale.rangeBand() / selectedCounters.length;
  
  var rects = xpGroups.selectAll("rect")
                        .data(function(d){ return d.counters; })
                    .enter()
                        .append("rect")
                        .attr({
                          x: function(d,i) { return i*rangeBand; },
                          y: function(d) { return self.yScale(d.y); },
                          width: rangeBand,
                          height: function(d) { return self.hScale(d.y); },
                          fill: function(d) { return self.colorScale(d.counter); }
                        });
  
  var legendAttr = {
     x: this.xScale.rangeBand()/2,
     y: Report.height - Report.padding,
  };
  legendAttr['transform'] = "rotate(270,"+legendAttr.x+","+legendAttr.y+")";
  
  xpGroupsEnter.append("text")
               .classed("legend", true)
               .attr(legendAttr)
               .text(function(d) {
                 var readableName = d.name.replace(/[\-_]/g, " ");
                 
                 if (d.failed)
                   return "[CRASHED] " + readableName;
                 else
                   return readableName;
               });
  
  this.drawLegend(selectedCounters);
}

CountersHistograms.prototype = {
  /**
   * Returns a simple data array made from raw_data
   * Updates yMax by the way
   */
  getData: function(raw_data, filter, selectedCounters) {
    var self = this;
    var data = new Array();
    
    for (var xp in raw_data) {
      if (!filter || filter.test(xp)) {
        var xpData = raw_data[xp];
        
        var xpCounters = selectedCounters.map(
          function(counter) {
            if (counter == "global_duration") {
              var y = xpData.duration;
            } else { 
              var y = xpData.flatjobs[counter];
            }
          
            if (y > self.yMax){
              self.yMax = y;
            }
          
            return { y: y, counter: counter };
          });
        
        data.push({
          counters: xpCounters,
          name: xp,
          failed: xpData.FAILED
        });
      }
    }
    
    return data;
  },
  
  drawLegend: function(selectedCounters) {
    var xScale = d3.scale.ordinal()
                         .domain(d3.range(selectedCounters.length))
                         .rangeBands([Report.padding, Report.width - 2*Report.padding], 0.1);
    
    var container = Report.svg.append('g').classed("legend", true);
    
    container.selectAll("text")
             .data(selectedCounters)
             .enter()
              .append("text")
              .text(function(d){ return d; })
              .attr({
                fill: this.colorScale,
                x: xScale,
                y: Report.padding/2
              });
  }
};















/**
 * From an experiment data object, show the stacked metric "metric"
 * Supports x-axis zooming
 */
function StackedHistograms(xpData, metric, monochrome) {
  var self = this;
  
  this.xpData = xpData;
  this.stacked_metric = xpData.stacked_metrics[metric];
  
  this.xScale = d3.scale.linear()
                        .range([Report.padding + 1, Report.width - Report.padding]);
  this.rangeBand = 0; // to be updated by updateDomains
  
  this.yScale = d3.scale.linear()
	                      .range([Report.height - Report.padding, Report.padding]);
	
	this.hScale = d3.scale.linear()
                        .range([0, Report.height - 2 * Report.padding]);
  
  if (monochrome) {
  	this.colorScale = function(){ return "#333"};
  } else {
  	this.colorScale = d3.scale.category20();
  }
  
  this.drawnBrush = Report.svg.append('g')
            .classed('brush', true);
  
  this.brush = d3.svg.brush()
                    .x(this.xScale)
                    .on("brushend", function(){
                      var extent = self.brush.extent().slice(0);
                      self.brush.clear();
                      self.drawnBrush.call(self.brush);
                      self.update(extent);
                    });
  
  this.drawnBrush.call(this.brush)
            .selectAll("rect")
            .attr({
              y: Report.padding,
              height: Report.height - 2*Report.padding
            });
	
  if (xpData.FAILED) {
    Report.svg.append('text')
              .text("FAILED XP")
              .classed('failed',true)
              .attr({
                x: Report.width/2,
                y: Report.padding
              });
  }
  
  
  this.updateAxisScales = Report.drawAxis(this.xScale, this.yScale, "Time (s)");
  
  this.update();
};

StackedHistograms.prototype = {
  /**
   * interval is an optional filter; if given it is assumed to be an array [xMin, xMax]
   */
  update: function(interval) {
    var data = this.getData(interval);
    
    this.updateDomains(data);
    this.updateAxisScales(this.xScale, this.yScale);
    this.updateJobSeparators();
    this.updateBars(data);
  },
  
  
  /**
   * interval is an optional filter; if given it is assumed to be an array [xMin, xMax]
   */
  getData: function(interval) {
    if (interval) {
      var xMin = interval[0];
      var xMax = interval[1];
      
      return this.stacked_metric.map(function(nodeLine) {
        return nodeLine.filter(function(datum) {
          return datum.x > xMin && datum.x < xMax;
        });
      });
    } else {
      return this.stacked_metric;
    }
  },
  
  /**
   * Update all scales' domains according to data
   */
  updateDomains: function(data) {
    var xStep = data[0][1].x - data[0][0].x;
	  var xDomain = [data[0][0].x, data[0][0].x + xStep * (data[0].length + 1) ];
	  
	  this.xScale.domain(xDomain);
	  this.rangeBand = this.xScale(data[0][1].x) - this.xScale(data[0][0].x);
		  
	  var domainTop = d3.max(data, function(line) {
	    return d3.max(line, function(v) {
	      return v.y0 + v.y;
	    });
	  });
		
		this.yScale.domain([0, domainTop]);
		this.hScale.domain([0, domainTop]);
  },
  
  /**
   * Dotted vertical markers show when did each M/R job finish
   */
  updateJobSeparators: function() {
    var self = this;
    var globalStart = this.xpData.start_timestamp;
    
    var separators = Report.svg.selectAll("line.jobseparators")
              .data(this.xpData.jobs);
    
    var separatorsEnter = separators.enter().append("g")
                          .classed("jobseparators", true)
                          .attr("transform", function(jobInfo) { 
                            return "translate("+self.xScale(jobInfo.end_timestamp - globalStart)+",0)"; 
                          });
    
    separatorsEnter.append('line')
                   .classed("jobseparator", true)
                    .attr({
                      x1: 0,
                      x2: 0,
                      y1: this.yScale.range()[0],
                      y2: this.yScale.range()[1]
                    });
    
    separatorsEnter.append("text")
                   .classed("jobID", true)
                   .attr({
                     x: -Report.padding,
                     y: -5,
                     transform: "rotate(270,0,0)"
                   })
                   .text(function(d, i) {
                    return "Job #"+i;
                   });
  },
  
  updateBars: function(data) {
    var self = this;
    var groups = Report.svg.selectAll("g.series")
			  .data(data);
		
		groups.enter()  
			  .append("g")
			  .attr("class", function(d) { return "series "+d[0].node; })
  			  .style("fill", function(d, i) {
  				return self.colorScale(i);
  			  });
	  
	  var rects = groups.selectAll("rect")
	                 .data(function(d) {return d;});
	  
	  rects.enter()
         .append("rect");
    
    rects.attr({
            x: function(d) { return self.xScale(d.x) },
            y: function(d) { return self.yScale(d.y0+d.y) },
            height: function(d) { return self.hScale(d.y) },
            width: this.rangeBand
          });
    
    rects.exit().remove();
  }
};
