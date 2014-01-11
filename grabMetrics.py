#!/usr/bin/env python

"""
USAGE: grabMetrics.py HADOOP_TRACE MASTERS_FILE SLAVES_FILE
HADOOP_TRACE is a file containing the whole driver program output
MASTERS_FILE and SLAVES_FILE list machines to be monitored (like $OAR_NODE_FILE or ~hadoop/conf/slaves) 

the script will output all metrics associated to the given driver run, as JSON 
"""

# Copyright (c) 2014, Martin Kirchgessner, Université Joseph Fourier
# All rights reserved.
# 
# Redistribution and use in source and binary forms, with or without modification,
# are permitted provided that the following conditions are met:
# 
# * Redistributions of source code must retain the above copyright notice, this
#   list of conditions and the following disclaimer.
# 
# * Redistributions in binary form must reproduce the above copyright notice, this
#   list of conditions and the following disclaimer in the documentation and/or
#   other materials provided with the distribution.
# 
# * Neither the name Université Joseph Fourier nor the names of 
#   contributors may be used to endorse or promote products derived from
#   this software without specific prior written permission.
# 
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
# ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


import sys
import urllib2
import json
import re
import datetime
import time

API_URL="https://api.grid5000.fr/3.0"

def getGangliaTimeseries(site, metric, machines, start, end):
	"""
	site is 'grenoble', 'rennes' ...
	metric is 'mem_free', 'cpu_idle' ...
	machines is expected to be an iterable of machine names (eg. ['edel-1','edel-2'])
	start and end are (integer) UNIX timestamps

	warning: if 'end' is current time, you may get "null" at the end of all timeseries
	
	returns : a dict where keys are machines names and values are timeseries (as float arrays) 
	with the lowest resolution available (15 seconds, only for past hour's metrics)
	"""
	
	# resolution should be ajusted by the server to the lowest resolution available
	url = API_URL + "/sites/" + site + "/metrics/" + metric + "/timeseries.json?resolution=15&only=" + ','.join(machines) + "&from=" + str(start) + "&to=" + str(end)
	raw = json.load(urllib2.urlopen(url))
	data = {}
	for line in raw["items"]:
		data[line['uid']] = line['values']
	
	return data

def readMachinesList(filename):
    "return (hostnames as a string array, site name) out from filename"
    machines = set()
    regexp = re.compile('([a-z0-9\-]+)\.([a-z]+)\.[\.\-a-z0-9]')
    site = False
    
    for line in open(filename):
        m = regexp.match(line.strip())

        if m:
            machines.add(m.group(1))
            
            if not site:
                site = m.group(2)
    
    return (machines,site)
    
def filterLog(filename):
    "Returns the Hadoop batch log file as an array of tuples (timestamp, log_string)"
    regexp = re.compile("([0-9]+/[0-9]+/[0-9]+ [0-9]+:[0-9]+:[0-9]+) [A-Z]+ mapred.JobClient: (.+)")
    
    filtered = []
    
    for line in open(filename):
        m = regexp.match(line.strip())
        if m:
            t = datetime.datetime.strptime(m.group(1), '%y/%m/%d %H:%M:%S')
            timestamp = int(time.mktime(t.timetuple()))
            filtered.append( (timestamp, m.group(2)) )
    
    return filtered

def parseLog(log):
    "Extracts an experiment data object (as a dict) from a filtered log"
    
    re_jobstart = re.compile("Running job: ([a-z0-9_]+)")
    re_jobend   = re.compile("Job complete: ([a-z0-9_]+)")
    re_counter  = re.compile("    ([a-zA-Z0-9\-_ ]+)=([0-9]+)")
    
    start = False
    end = False
    data = {}
    data['jobs'] = []
    currentJob = False
    
    for (t, msg) in log:
        if not start:
            start = t
        end = t
        
        m = re_jobstart.match(msg)
        if m:
            if currentJob:
                data['jobs'].append(currentJob)
            currentJob = {
                'start_timestamp': t,
                'jobid': m.group(1)
            }
            
        else:
            m = re_jobend.match(msg)
            if m:
                currentJob['end_timestamp'] = t
                currentJob['duration'] = t - currentJob['start_timestamp']
                
            else:
                m = re_counter.match(msg)
                if m:
                    counter = m.group(1)
                    currentJob[counter] = int(m.group(2))
                    
                    if "Failed" in counter:
                        currentJob['FAILED'] = True
                        data['FAILED'] = True
        
    data['jobs'].append(currentJob)
    data["start_timestamp"] = start
    data["end_timestamp"] = end
    data["duration"] = end - start
    
    return data




if __name__ == "__main__":
    if len(sys.argv) != 4:
        print __doc__
    else:
        filteredLog = filterLog(sys.argv[1])
        data = parseLog(filteredLog)

        (masters,site) = readMachinesList(sys.argv[2])
        (slaves ,site) = readMachinesList(sys.argv[3])
        machines = masters | slaves
        
        data['masters'] = list(masters)
        data['slaves'] = list(slaves)
        
        metrics = {}
        for metric in ("cpu_user", "bytes_in", "bytes_out", "mem_free"):
            metrics[metric] = getGangliaTimeseries(site, metric, machines, data["start_timestamp"], data["end_timestamp"])
        
        data['metrics'] = metrics
        
        print json.dumps(data, sort_keys = True, indent=True)
