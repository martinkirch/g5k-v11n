/*
Copyright (c) 2014, Martin Kirchgessner, Université Joseph Fourier
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

* Neither the name Université Joseph Fourier nor the names of 
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var Report = {
  data: null,
  
  svg: null,
  width: 1220,
  height: 600,
  padding: 40,
  
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

        Report.current = new StackedHistograms(Report.data[xpName], metric);
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
   */
  drawAxis: function(xScale, yScale) {
    var xAxis = null;
    var xGrid = null;
    
    if (xScale) {
      xAxis = d3.svg.axis().orient('bottom');

  		xGrid = Report.svg.append('g')
  			.classed('axis', true)
  			.attr('transform', 'translate(0,'+ (Report.height - Report.padding + 1)+')')
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
    		                 .data(y.ticks(10));
    		
    		lines.exit()
    		     .remove();
    		
    		lines.enter()
    		    .append('line')
    		    .classed('grid', true)
    		    .attr({
    		      x1: 0,
    		      x2: Report.width,
    		    });
    		
    		lines.attr({
    		  y1: y,
    		  y2: y
    		});
		  }
		};
		
		updater(xScale, yScale);
		
		return updater;
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
function StackedHistograms(xpData, metric) {
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
  
  this.colorScale = d3.scale.category20();
  
  
  
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
  
  
  this.updateAxisScales = Report.drawAxis(this.xScale, this.yScale);
  
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
    var separators = Report.svg.selectAll("line.jobseparator")
              .data(this.xpData.jobs)
    
    separators.enter()
                .append('line')
                .classed("jobseparator", true)
     
    var globalStart = this.xpData.start_timestamp;
    separators.attr({
      x1: function(jobInfo) { return self.xScale(jobInfo.end_timestamp - globalStart) },
      x2: function(jobInfo) { return self.xScale(jobInfo.end_timestamp - globalStart) },
      y1: this.yScale.range()[0],
      y2: this.yScale.range()[1]
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
