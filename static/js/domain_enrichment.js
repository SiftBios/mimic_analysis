// File: static/js/domain_enrichment.js
// JavaScript for the domain enrichment page visualizations

// Function to export a D3 visualization as a PNG image
function exportChartAsPng(svgElement, fileName, buttonId) {
    // Get the SVG element
    const svg = svgElement;
    if (!svg) {
        console.error("SVG element not found");
        return;
    }
    
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const bbox = svg.getBoundingClientRect();
    canvas.width = bbox.width;
    canvas.height = bbox.height;
    
    // Get the SVG data as a string with proper XML declaration
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    // Create an image from the SVG
    const img = new Image();
    img.onload = function() {
        // Draw the image to the canvas
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        // Convert canvas to PNG
        try {
            const pngUrl = canvas.toDataURL('image/png');
            
            // Create download link
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = fileName;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // Clean up
            URL.revokeObjectURL(url);
            
            // Provide feedback if button ID provided
            if (buttonId) {
                const exportBtn = document.getElementById(buttonId);
                if (exportBtn) {
                    const originalText = exportBtn.innerHTML;
                    exportBtn.innerHTML = '<i class="bi bi-check"></i> Downloaded';
                    exportBtn.classList.remove('btn-outline-primary');
                    exportBtn.classList.add('btn-success');
                    
                    // Reset button after 2 seconds
                    setTimeout(() => {
                        exportBtn.innerHTML = originalText;
                        exportBtn.classList.remove('btn-success');
                        exportBtn.classList.add('btn-outline-primary');
                    }, 2000);
                }
            }
        } catch (e) {
            console.error("Error exporting PNG:", e);
            alert("Failed to export image. See console for details.");
        }
    };
    
    img.onerror = function() {
        console.error("Error loading SVG as image");
        URL.revokeObjectURL(url);
    };
    
    img.src = url;
}

// Create PFAM/KOFAM enrichment bar charts
function createEnrichmentBarChart(data, containerId, title, domainPrefix, isEnriched = true) {
    console.log(`Creating chart for ${containerId} with ${data ? data.length : 0} data points:`, 
                 data && data.length > 0 ? data[0] : 'No data');
    
    if (!data || data.length === 0) {
        console.log(`No data available for ${containerId}`);
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-warning">
                    <h5>No ${isEnriched ? 'enriched' : 'depleted'} domains found</h5>
                    <p>The data array is empty or undefined.</p>
                </div>`;
        }
        return null;
    }
    
    // Clear the container
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return null;
    }
    
    // Check container dimensions but don't abort if they're zero
    const containerRect = container.getBoundingClientRect();
    console.log(`Container #${containerId} dimensions:`, 
                `width=${containerRect.width}, height=${containerRect.height}`);
    
    // Force container to have minimum dimensions if it's currently zero
    // This can happen when the container is in a hidden tab
    if (containerRect.width === 0 || containerRect.height === 0) {
        console.warn(`Container #${containerId} has zero width/height, but proceeding anyway...`);
        // Set a minimum height to ensure the container is visible
        container.style.minHeight = "500px";
        container.style.minWidth = "800px";
    }
    
    container.innerHTML = '';
    
    // Check if D3 is available
    if (typeof d3 === 'undefined') {
        console.error('D3.js is not loaded or not available!');
        container.innerHTML = `
            <div class="alert alert-danger">
                <h5>D3.js not found</h5>
                <p>The D3.js library is required for this visualization but could not be found.</p>
            </div>`;
        return null;
    }
    
    // Set up chart dimensions
    const margin = {top: 50, right: 30, bottom: 120, left: 80};
    // Fixed width that fits on the page better
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Add a background rectangle to make SVG visible even if empty
    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', '#f8f9fa')
        .attr('stroke', '#dee2e6');
    
        
    // Log that SVG was created
    console.log(`SVG for ${containerId} created with dimensions:`, 
                `width=${width + margin.left + margin.right}, height=${height + margin.top + margin.bottom}`);
    
    // Sort data by enrichment
    const sortedData = [...data].sort((a, b) => b.enrichment - a.enrichment);
    const topData = sortedData.slice(0, 15); // Show only top 15 domains
    
    // Set up scales
    const x = d3.scaleBand()
        .range([0, width])
        .domain(topData.map(d => d.domain)) // Use domain from the data
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(topData, d => d.enrichment || 0) * 1.1 || 1])
        .range([height, 0]);
    
    // Color scale - blue for enriched, red for depleted
    const maxEnrichment = d3.max(topData, d => d.enrichment || 0) || 1;
    const colorScale = isEnriched ? 
        d3.scaleLinear()
            .domain([0, maxEnrichment])
            .range(['#9ecae1', '#08519c']) :
        d3.scaleLinear()
            .domain([0, maxEnrichment])
            .range(['#fcae91', '#a50f15']);
    
    // Create bars
    svg.selectAll('.bar')
        .data(topData)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.domain)) // Use domain from the data
        .attr('width', x.bandwidth())
        .attr('y', d => y(d.enrichment || 0))
        .attr('height', d => height - y(d.enrichment || 0))
        .attr('fill', d => colorScale(d.enrichment || 0))
        .attr('data-bs-toggle', 'tooltip')
        .attr('data-bs-html', 'true')
        .attr('title', d => `<strong>${d.domain}</strong><br>
                             ${d.description || ''}<br>
                             Fold ${isEnriched ? 'Enrichment' : 'Depletion'}: ${d.enrichment ? d.enrichment.toFixed(2) : 'N/A'}<br>
                             p-value: ${d.p_value ? d.p_value.toExponential(2) : 'N/A'}`);
    
    // Add x-axis
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // Add y-axis
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .text(title);
    
    // Add y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 20)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .text('Fold Enrichment');
    
    // Initialize tooltips
    try {
        const tooltipTriggerList = document.querySelectorAll(`#${containerId} [data-bs-toggle="tooltip"]`);
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    } catch (e) {
        console.warn("Bootstrap tooltips initialization failed:", e);
    }
    
    // Add export button
    const exportButtonId = `export-${containerId}`;
    const exportButton = document.createElement('button');
    exportButton.id = exportButtonId;
    exportButton.className = 'btn btn-outline-primary btn-sm mt-2';
    exportButton.innerHTML = '<i class="bi bi-download"></i> Export as PNG';
    container.appendChild(exportButton);
    
    // Event listener for export button
    document.getElementById(exportButtonId).addEventListener('click', () => {
        exportChartAsPng(
            document.querySelector(`#${containerId} svg`),
            `${domainPrefix}-${isEnriched ? 'enrichment' : 'depletion'}-chart.png`,
            exportButtonId
        );
    });
    
    return svg.node();
}

// Create exclusive domains visualization
function createExclusiveDomainsViz(data, containerId, title) {
    if (!data || data.length === 0) {
        document.getElementById(containerId).innerHTML = '<p>No exclusive domains found.</p>';
        return null;
    }
    
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // Create a table for displaying exclusive domains
    const table = document.createElement('table');
    table.className = 'table table-striped table-hover';
    
    // Create table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Domain ID</th>
            <th>Description</th>
            <th>Count</th>
            <th>Proteins</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Create table body
    const tbody = document.createElement('tbody');
    data.forEach(domain => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${domain.domain_id}</td>
            <td>${domain.domain_description || 'N/A'}</td>
            <td>${domain.count}</td>
            <td>${domain.proteins ? domain.proteins.slice(0, 3).join(', ') + (domain.proteins.length > 3 ? ', ...' : '') : 'N/A'}</td>
        `;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    
    // Add title
    const titleElement = document.createElement('h4');
    titleElement.textContent = title;
    container.appendChild(titleElement);
    
    // Add the table to the container
    container.appendChild(table);
    
    return table;
}

// Create domain distribution visualization
function createDomainDistributionChart(pfamData, kofamData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container ${containerId} not found`);
        return;
    }
    
    container.innerHTML = '';
    
    // Check if data is available
    if ((!pfamData || pfamData.length === 0) && (!kofamData || kofamData.length === 0)) {
        container.innerHTML = '<p>No domain distribution data available.</p>';
        return;
    }
    
    // Process data for pie charts
    const processDomainData = (domains) => {
        if (!domains || domains.length === 0) return [];
        
        // Group by domain category
        const categoryMap = new Map();
        domains.forEach(domain => {
            const category = domain.category || 'Unknown';
            if (!categoryMap.has(category)) {
                categoryMap.set(category, 0);
            }
            categoryMap.set(category, categoryMap.get(category) + domain.count);
        });
        
        // Convert to array for visualization
        return Array.from(categoryMap.entries()).map(([category, count]) => ({
            category,
            count
        })).sort((a, b) => b.count - a.count);
    };
    
    const pfamProcessed = processDomainData(pfamData);
    const kofamProcessed = processDomainData(kofamData);
    
    // Create row for charts
    const row = document.createElement('div');
    row.className = 'row';
    
    // Create columns for PFAM and KOFAM
    const pfamCol = document.createElement('div');
    pfamCol.className = 'col-md-6';
    pfamCol.id = 'pfam-distribution-chart';
    
    const kofamCol = document.createElement('div');
    kofamCol.className = 'col-md-6';
    kofamCol.id = 'kofam-distribution-chart';
    
    row.appendChild(pfamCol);
    row.appendChild(kofamCol);
    container.appendChild(row);
    
    // Create pie charts for both
    createPieChart(pfamProcessed, 'pfam-distribution-chart', 'PFAM Domain Categories');
    createPieChart(kofamProcessed, 'kofam-distribution-chart', 'KOFAM Domain Categories');
}

// Create pie chart
function createPieChart(data, containerId, title) {
    if (!data || data.length === 0) {
        document.getElementById(containerId).innerHTML = '<p>No data available for visualization.</p>';
        return;
    }
    
    // Set up dimensions
    const width = 400;
    const height = 400;
    const radius = Math.min(width, height) / 2;
    
    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);
    
    // Color scale
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Create pie chart
    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);
    
    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius * 0.8);
    
    const outerArc = d3.arc()
        .innerRadius(radius * 0.9)
        .outerRadius(radius * 0.9);
    
    // Draw arcs
    const arcs = svg.selectAll('.arc')
        .data(pie(data))
        .enter()
        .append('g')
        .attr('class', 'arc');
    
    arcs.append('path')
        .attr('d', arc)
        .attr('fill', (d, i) => color(i))
        .attr('stroke', 'white')
        .style('stroke-width', '2px')
        .attr('data-bs-toggle', 'tooltip')
        .attr('title', d => {
            const total = d3.sum(data, item => item.count || 0);
            const percentage = total > 0 ? (d.data.count || 0) / total * 100 : 0;
            return `${d.data.category || 'Unknown'}: ${d.data.count || 0} (${percentage.toFixed(1)}%)`;
        });
    
    // Add title
    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', -height/2 + 20)
        .text(title)
        .style('font-size', '16px')
        .style('font-weight', 'bold');
    
    // Add legend
    const legend = svg.selectAll('.legend')
        .data(data)
        .enter()
        .append('g')
        .attr('class', 'legend')
        .attr('transform', (d, i) => `translate(-${width/2 - 20}, ${height/3 - 20 - i * 20})`);
    
    legend.append('rect')
        .attr('width', 18)
        .attr('height', 18)
        .attr('fill', (d, i) => color(i));
    
    legend.append('text')
        .attr('x', 24)
        .attr('y', 9)
        .attr('dy', '.35em')
        .text(d => d.category);
    
    // Initialize tooltips
    try {
        const tooltipTriggerList = document.querySelectorAll(`#${containerId} [data-bs-toggle="tooltip"]`);
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    } catch (e) {
        console.warn("Bootstrap tooltips initialization failed:", e);
    }
    
    // Add export button
    const exportButtonId = `export-${containerId}`;
    const exportButton = document.createElement('button');
    exportButton.id = exportButtonId;
    exportButton.className = 'btn btn-outline-primary btn-sm mt-2';
    exportButton.innerHTML = '<i class="bi bi-download"></i> Export as PNG';
    document.getElementById(containerId).appendChild(exportButton);
    
    // Event listener for export button
    document.getElementById(exportButtonId).addEventListener('click', () => {
        exportChartAsPng(
            document.querySelector(`#${containerId} svg`),
            `${containerId}-chart.png`,
            exportButtonId
        );
    });
}

// Set up export functionality for binding domains data
function setupBindingDomainsExport(bindingDomainStats) {
    const exportBtn = document.getElementById('export-binding-domains-csv');
    if (!exportBtn) return;
    
    exportBtn.addEventListener('click', function() {
        // Convert binding domain stats to CSV
        const data = Array.from(bindingDomainStats.values());
        
        // Define CSV header
        const header = [
            'domain_id',
            'binding_count',
            'sequence_count',
            'normalized_ratio',
            'avg_affinity',
            'avg_bitscore',
            'domain_instances',
            'metagenome_count'
        ].join(',');
        
        // Convert each row to CSV
        const rows = data.map(domain => {
            // Calculate metagenome count if possible
            const metagenomeCount = domain.noMetagenomeData ? 'N/A' : 
                Math.round(domain.bindingCount / (domain.normalizedRatio || 1));
            
            return [
                domain.domain,
                domain.bindingCount,
                domain.sequenceCount,
                domain.normalizedRatio ? (domain.normalizedRatio * 100).toFixed(2) + '%' : 'N/A',
                domain.avgAffinity.toFixed(2),
                domain.avgBitScore.toFixed(2),
                domain.domainInstances,
                metagenomeCount
            ].join(',');
        });
        
        // Combine header and rows
        const csv = [header, ...rows].join('\n');
        
        // Create a blob and download link
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'binding_domains.csv';
        a.click();
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Provide feedback
        const originalText = exportBtn.innerHTML;
        exportBtn.innerHTML = '<i class="bi bi-check"></i> Downloaded';
        exportBtn.classList.remove('btn-outline-primary');
        exportBtn.classList.add('btn-success');
        
        // Reset button after 2 seconds
        setTimeout(() => {
            exportBtn.innerHTML = originalText;
            exportBtn.classList.remove('btn-success');
            exportBtn.classList.add('btn-outline-primary');
        }, 2000);
    });
}
// Extract binding positions and domain positions from data
function extractBindingAndDomainPositions(data, affinityThreshold, bindingLevel, callback) {
    // We'll process the data asynchronously to avoid blocking the UI
    setTimeout(() => {
        // Get all binding data with positions
        const allBindingData = data.allEnrichmentData || [];
        const pfamDomains = data.pfamDomains || [];
        
        // Extract positions for binding peptides
        const bindingPositions = [];
        
        allBindingData.forEach(item => {
            // Check if this is a mimic peptide with position data
            if (item.mimic_Peptide && item.position_start && item.position_end) {
                // Apply filters if specified
                let includeItem = true;
                
                // Filter by affinity if available
                if (affinityThreshold && item.mimic_Aff) {
                    const affinity = parseFloat(item.mimic_Aff);
                    if (!isNaN(affinity) && affinity > affinityThreshold) {
                        includeItem = false;
                    }
                }
                
                // Filter by binding level if specified
                if (bindingLevel && item.mimic_BindLevel) {
                    if (!item.mimic_BindLevel.includes(bindingLevel)) {
                        includeItem = false;
                    }
                }
                
                if (includeItem) {
                    bindingPositions.push({
                        sequence_id: item.mimic_gene,
                        start: parseInt(item.position_start),
                        end: parseInt(item.position_end),
                        peptide: item.mimic_Peptide,
                        affinity: parseFloat(item.mimic_Aff) || 0
                    });
                }
            }
        });
        
        // Extract domain positions - convert env_from/env_to to start/end if needed
        const domainPositions = pfamDomains.map(domain => {
            return {
                sequence_id: domain.sequence_id,
                hmm_name: domain.domain_id || domain.hmm_name,
                start: domain.start || domain.env_from,
                end: domain.end || domain.env_to,
                bitscore: domain.bitscore || 0,
                e_value: domain.evalue || domain.e_value || 1
            };
        });
        
        // Return the extracted positions
        callback(bindingPositions, domainPositions);
    }, 0);
}



// Create binding domains visualization
function createBindingDomainsViz(bindingData, containerId) {
    if (!bindingData || Object.keys(bindingData).length === 0) {
        document.getElementById(containerId).innerHTML = '<p>No binding domain data available.</p>';
        return;
    }
    
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    // Create tab structure
    const tabsHtml = `
        <ul class="nav nav-tabs" id="bindingDomainsTabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="heatmap-tab" data-bs-toggle="tab" 
                    data-bs-target="#heatmap-content" type="button" role="tab" 
                    aria-controls="heatmap-content" aria-selected="true">Heatmap</button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="network-tab" data-bs-toggle="tab" 
                    data-bs-target="#network-content" type="button" role="tab" 
                    aria-controls="network-content" aria-selected="false">Network</button>
            </li>
        </ul>
        <div class="tab-content" id="bindingDomainsTabContent">
            <div class="tab-pane fade show active" id="heatmap-content" role="tabpanel" aria-labelledby="heatmap-tab">
                <div id="binding-heatmap"></div>
            </div>
            <div class="tab-pane fade" id="network-content" role="tabpanel" aria-labelledby="network-tab">
                <div id="binding-network"></div>
            </div>
        </div>
    `;
    
    container.innerHTML = tabsHtml;
    
    // Process data for heatmap
    const pairs = [];
    Object.entries(bindingData).forEach(([domain1, interactions]) => {
        Object.entries(interactions).forEach(([domain2, score]) => {
            pairs.push({
                source: domain1,
                target: domain2,
                score: score
            });
        });
    });
    
    // Create binding domains heatmap
    createBindingHeatmap(pairs, 'binding-heatmap');
    
    // Create binding domains network
    createBindingNetwork(pairs, 'binding-network');
    
    // Add event listener for tab changes to handle resize issues
    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function (event) {
            // Force resize of visualizations when tab is shown
            window.dispatchEvent(new Event('resize'));
        });
    });
}

// Create binding domains chart
function createBindingDomainsChart(bindingDomainStats, containerId = 'binding-domains-chart') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return;
    }
    
    container.innerHTML = '';
    
    // Handle both array and map inputs, and normalize property names
    let data;
    if (Array.isArray(bindingDomainStats)) {
        // Server returns array with snake_case properties
        data = bindingDomainStats
            .map(d => ({
                domain: d.domain,
                bindingCount: d.binding_count || 0,
                sequenceCount: d.sequence_count || 0,
                avgAffinity: d.avg_affinity || 0,
                avgBitScore: d.avg_bitscore || 0,
                normalizedRatio: d.normalized_ratio || 0,
                noMetagenomeData: d.no_metagenome_data || false
            }))
            .sort((a, b) => b.bindingCount - a.bindingCount)
            .slice(0, 15); // Show top 15 domains
    } else {
        // Client-side analysis returns Map with camelCase properties
        data = Array.from(bindingDomainStats.values())
            .sort((a, b) => b.bindingCount - a.bindingCount)
            .slice(0, 15); // Show top 15 domains
    }
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No binding domains found matching the current filters.</div>';
        return;
    }
    
    // Set up dimensions
    const margin = {top: 30, right: 30, bottom: 90, left: 80};
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Create scales
    const x = d3.scaleBand()
        .range([0, width])
        .domain(data.map(d => d.domain))
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.bindingCount) * 1.1 || 1]) // Ensure non-zero domain
        .range([height, 0]);
    
    // Create axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Add bars
    svg.selectAll('rect')
        .data(data)
        .join('rect')
        .attr('x', d => x(d.domain))
        .attr('y', d => y(d.bindingCount))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.bindingCount))
        .attr('fill', '#4682B4')
        .attr('data-bs-toggle', 'tooltip')
        .attr('data-bs-html', 'true')
        .attr('title', d => {
            // Include normalized ratio in the tooltip
            const normalizedRatio = d.noMetagenomeData ? 'N/A' : (d.normalizedRatio * 100).toFixed(2) + '%';
            return `
                <strong>${d.domain}</strong><br>
                Binding Count: ${d.bindingCount}<br>
                Sequence Count: ${d.sequenceCount}<br>
                Normalized Ratio: ${normalizedRatio}<br>
                Avg. Affinity: ${d.avgAffinity.toFixed(2)} nM<br>
                Avg. BitScore: ${d.avgBitScore.toFixed(2)}
            `;
        });
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .text('Top PFAM Domains Containing Binding Peptides');
    
    // Add y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 20)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .text('Binding Peptide Count');
    
    // Initialize tooltips
    try {
        const tooltipTriggerList = document.querySelectorAll(`#${containerId} [data-bs-toggle="tooltip"]`);
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    } catch (e) {
        console.warn("Bootstrap tooltips initialization failed:", e);
    }
    
    // Add export button
    const exportButtonId = `export-${containerId}`;
    const exportButton = document.createElement('button');
    exportButton.id = exportButtonId;
    exportButton.className = 'btn btn-outline-primary btn-sm mt-2';
    exportButton.innerHTML = '<i class="bi bi-download"></i> Export as PNG';
    container.appendChild(exportButton);
    
    // Event listener for export button
    document.getElementById(exportButtonId).addEventListener('click', () => {
        exportChartAsPng(
            document.querySelector(`#${containerId} svg`),
            'binding-domains-chart.png',
            exportButtonId
        );
    });
}

// Create normalized binding chart - showing domains by normalized binding ratio
function createNormalizedBindingChart(bindingDomainStats, containerId = 'normalized-binding-chart') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return;
    }
    
    container.innerHTML = '';
    
    // Handle both array and map inputs, and normalize property names
    let data;
    if (Array.isArray(bindingDomainStats)) {
        // Server returns array with snake_case properties
        data = bindingDomainStats
            .map(d => ({
                domain: d.domain,
                bindingCount: d.binding_count || 0,
                sequenceCount: d.sequence_count || 0,
                avgAffinity: d.avg_affinity || 0,
                avgBitScore: d.avg_bitscore || 0,
                normalizedRatio: d.normalized_ratio || 0.0001, // Use small value instead of 0
                noMetagenomeData: d.no_metagenome_data || false
            }))
            .filter(d => !d.noMetagenomeData) // Only filter out domains without metagenome data
            .sort((a, b) => b.normalizedRatio - a.normalizedRatio)
            .slice(0, 15); // Show top 15 domains
    } else {
        // Client-side analysis returns Map with camelCase properties
        data = Array.from(bindingDomainStats.values())
            .filter(d => !d.noMetagenomeData) // Only filter out domains without metagenome data
            .sort((a, b) => b.normalizedRatio - a.normalizedRatio)
            .slice(0, 15); // Show top 15 domains
    }
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No normalized binding data available with current filters.</div>';
        return;
    }
    
    // Set up dimensions
    const margin = {top: 30, right: 30, bottom: 90, left: 80};
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Create scales
    const x = d3.scaleBand()
        .range([0, width])
        .domain(data.map(d => d.domain))
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.normalizedRatio) * 1.1 || 0.01]) // Ensure non-zero domain with fallback
        .range([height, 0]);
    
    // Create axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    svg.append('g')
        .call(d3.axisLeft(y).tickFormat(d => (d * 100).toFixed(0) + '%')); // Format y-axis as percentage
    
    // Add bars with different color scheme
    svg.selectAll('rect')
        .data(data)
        .join('rect')
        .attr('x', d => x(d.domain))
        .attr('y', d => y(d.normalizedRatio || 0.0001)) // Use small value for zero ratios
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.normalizedRatio || 0.0001)) // Use small value for zero ratios
        .attr('fill', '#5DAB76') // Different color for normalized chart
        .attr('data-bs-toggle', 'tooltip')
        .attr('data-bs-html', 'true')
        .attr('title', d => `
            <strong>${d.domain}</strong><br>
            Normalized Ratio: ${(d.normalizedRatio * 100).toFixed(2)}%<br>
            Binding Count: ${d.bindingCount}<br>
            Total Domain Count: ${Math.round(d.bindingCount / (d.normalizedRatio || 0.0001))}<br>
            Avg. Affinity: ${d.avgAffinity.toFixed(2)} nM
        `);
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .text('Top Domains by Normalized Binding Ratio');
    
    // Add y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 20)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .text('Binding Ratio (%)');
    
    // Initialize tooltips
    try {
        const tooltipTriggerList = document.querySelectorAll(`#${containerId} [data-bs-toggle="tooltip"]`);
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    } catch (e) {
        console.warn("Bootstrap tooltips initialization failed:", e);
    }
    
    // Add export button
    const exportButtonId = `export-${containerId}`;
    const exportButton = document.createElement('button');
    exportButton.id = exportButtonId;
    exportButton.className = 'btn btn-outline-primary btn-sm mt-2';
    exportButton.innerHTML = '<i class="bi bi-download"></i> Export as PNG';
    container.appendChild(exportButton);
    
    // Event listener for export button
    document.getElementById(exportButtonId).addEventListener('click', () => {
        exportChartAsPng(
            document.querySelector(`#${containerId} svg`),
            'normalized-binding-chart.png',
            exportButtonId
        );
    });
}

// Analyze binding domains function - determines which domains contain mimic peptides
function analyzeBindingDomains(bindingPositions, pfamDomains, progressCallback) {
    // Map to store binding domain statistics
    const bindingDomainStats = new Map();
    
    // Variables for progress tracking
    const totalSequences = new Set(pfamDomains.map(domain => domain.sequence_id)).size;
    let processedSequences = 0;
    
    // Get domain counts from metagenome data
    const domainMetagenomeCounts = {};
    
    // Check if we have metagenome data available
    if (window.enrichmentData && window.enrichmentData.allEnrichmentData) {
        // Extract domain counts from allEnrichmentData
        window.enrichmentData.allEnrichmentData.forEach(domain => {
            if (domain.domain) {
                domainMetagenomeCounts[domain.domain] = domain.background_count || 0;
            }
        });
    }
    
    // Group domains by sequence ID for faster lookups
    const domainsBySequence = {};
    pfamDomains.forEach(domain => {
        if (!domainsBySequence[domain.sequence_id]) {
            domainsBySequence[domain.sequence_id] = [];
        }
        domainsBySequence[domain.sequence_id].push(domain);
    });
    
    // Group binding positions by sequence ID
    const bindingBySequence = {};
    bindingPositions.forEach(binding => {
        if (!bindingBySequence[binding.sequence_id]) {
            bindingBySequence[binding.sequence_id] = [];
        }
        bindingBySequence[binding.sequence_id].push(binding);
    });
    
    // Process each sequence
    const sequenceIds = Object.keys(domainsBySequence);
    
    // Process in batches to avoid UI freezing
    const batchSize = 100;
    let currentBatch = 0;
    
    function processBatch() {
        const start = currentBatch * batchSize;
        const end = Math.min((currentBatch + 1) * batchSize, sequenceIds.length);
        
        for (let i = start; i < end; i++) {
            const sequenceId = sequenceIds[i];
            const domains = domainsBySequence[sequenceId] || [];
            const bindingPositions = bindingBySequence[sequenceId] || [];
            
            // Find which domains contain binding peptides
            domains.forEach(domain => {
                const domainStart = domain.start || domain.env_from;
                const domainEnd = domain.end || domain.env_to;
                const domainName = domain.hmm_name || domain.domain;
                
                // Count binding peptides within this domain
                const containedBindings = bindingPositions.filter(binding => 
                    binding.start >= domainStart && binding.end <= domainEnd
                );
                
                if (containedBindings.length > 0) {
                    // Update domain stats
                    if (!bindingDomainStats.has(domainName)) {
                        bindingDomainStats.set(domainName, {
                            domain: domainName,
                            bindingCount: 0,
                            sequenceCount: 0,
                            sequences: new Set(),
                            totalAffinity: 0,
                            bitScoreSum: 0,
                            domainInstances: 0
                        });
                    }
                    
                    const stats = bindingDomainStats.get(domainName);
                    stats.bindingCount += containedBindings.length;
                    stats.sequences.add(sequenceId);
                    stats.domainInstances++;
                    stats.bitScoreSum += domain.bitscore || 0;
                    
                    // Sum up affinity values if available
                    containedBindings.forEach(binding => {
                        if (binding.affinity) {
                            stats.totalAffinity += binding.affinity;
                        }
                    });
                }
            });
            
            // Update progress
            processedSequences++;
        }
        
        // Report progress
        if (progressCallback) {
            const progress = Math.min(100, Math.round((processedSequences / totalSequences) * 100));
            progressCallback(progress, `Processed ${processedSequences} of ${totalSequences} sequences`);
        }
        
        // Continue with next batch or finish
        currentBatch++;
        if (currentBatch * batchSize < sequenceIds.length) {
            // Schedule next batch with a small delay to allow UI updates
            setTimeout(processBatch, 10);
        } else {
            // All done, finalize stats
            finalizeStats();
            if (progressCallback) {
                progressCallback(100, "Analysis complete", bindingDomainStats);
            }
        }
    }
    
    function finalizeStats() {
        // Calculate averages and percentages for each domain
        bindingDomainStats.forEach(stats => {
            stats.sequenceCount = stats.sequences.size;
            stats.avgAffinity = stats.bindingCount > 0 ? stats.totalAffinity / stats.bindingCount : 0;
            stats.avgBitScore = stats.domainInstances > 0 ? stats.bitScoreSum / stats.domainInstances : 0;
            
            // Calculate normalized ratio (binding count / total domain instances in metagenome)
            const metagenomeCount = domainMetagenomeCounts[stats.domain] || 0;
            stats.normalizedRatio = metagenomeCount > 0 ? stats.bindingCount / metagenomeCount : 0;
            
            // If there's no metagenome data but we have binding domains, set a flag
            if (metagenomeCount === 0 && stats.bindingCount > 0) {
                stats.noMetagenomeData = true;
            }
        });
    }
    
    // Start processing
    processBatch();
    
    // Don't return anything - we'll use the callback instead
    // The bindingDomainStats will be passed to the callback when processing is complete
}


// Event handler for "Run Binding Domain Analysis" button
function initBindingDomainsAnalysis() {
    // Cache DOM elements
    const runButton = document.getElementById('run-binding-analysis');
    const runCard = document.getElementById('binding-domains-run-card');
    const progressCard = document.getElementById('binding-domains-progress-card');
    const progressBar = document.getElementById('binding-domains-progress-bar');
    const progressStatus = document.getElementById('binding-domains-progress-status');
    const resultsCard = document.getElementById('binding-domains-results-card');
    const tableCard = document.getElementById('binding-domains-table-card');
    const applyFiltersBtn = document.getElementById('apply-binding-filters');
    
    // Cache for last used analysis parameters to avoid redundant calls
    window.lastAnalysisParams = null;
    
    if (!runButton && !applyFiltersBtn) return;
    
    // Common function to start analysis - eliminates code duplication
    function startAnalysis(isFilterUpdate = false) {
        // Get filter values
        const affinityThreshold = parseFloat(document.getElementById('binding-affinity-threshold').value) || 500;
        const bindingLevel = document.getElementById('binding-level-filter').value;
        const maxSequences = 10000000; // Could be made configurable
        
        // Generate a session ID for this analysis
        const sessionId = Date.now().toString();
        
        // Create parameters object
        const analysisParams = {
            binding_threshold: affinityThreshold,
            binding_level: bindingLevel,
            max_sequences: maxSequences,
            session_id: sessionId
        };
        
        // Skip if parameters are identical to last analysis (prevents redundant calls)
        if (window.lastAnalysisParams && 
            window.lastAnalysisParams.binding_threshold === analysisParams.binding_threshold &&
            window.lastAnalysisParams.binding_level === analysisParams.binding_level &&
            !isFilterUpdate) {
            console.log("Skipping redundant analysis with identical parameters");
            return;
        }
        
        // Cache the parameters
        window.lastAnalysisParams = analysisParams;
        
        // Update UI
        runCard.style.display = 'none';
        if (isFilterUpdate) {
            resultsCard.style.display = 'none';
            tableCard.style.display = 'none';
        }
        progressCard.style.display = 'block';
        
        // Reset progress bar
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', 0);
        progressBar.textContent = '0%';
        progressBar.classList.add('progress-bar-animated', 'bg-primary');
        progressBar.classList.remove('bg-danger');
        progressStatus.textContent = isFilterUpdate ? 'Applying filters...' : 'Initializing analysis...';
        
        console.log(`Starting binding domain analysis with threshold=${affinityThreshold}, level=${bindingLevel}`);
        
        // Start analysis with progress tracking
        fetch('/api/binding_domains_progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(analysisParams)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Get the task ID and start polling for updates
            const taskId = data.task_id;
            console.log(`Task started with ID: ${taskId}`);
            pollTaskStatus(taskId);
        })
        .catch(error => {
            console.error(`Error ${isFilterUpdate ? 'applying filters' : 'starting analysis'}:`, error);
            // Show error in progress bar
            progressStatus.innerHTML = 
                `<div class="alert alert-danger">Error: ${error.message}</div>`;
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.remove('bg-primary');
            progressBar.classList.add('bg-danger');
        });
    }
    
    // Set up event handlers
    if (runButton) {
        runButton.addEventListener('click', () => startAnalysis(false));
    }
    
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => startAnalysis(true));
    }
}

// Update binding domains table
function updateBindingDomainsTable(bindingDomainStats, tableBodyId, totalSequences) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) {
        console.error(`Table body #${tableBodyId} not found`);
        return;
    }
    
    // Update the table header to include the new column
    const tableHeader = document.querySelector(`#${tableBodyId}`).closest('table').querySelector('thead tr');
    if (tableHeader && !tableHeader.querySelector('th[data-column="normalizedRatio"]')) {
        // Add the normalized ratio column header if it doesn't exist
        const normalizedHeader = document.createElement('th');
        normalizedHeader.setAttribute('data-column', 'normalizedRatio');
        normalizedHeader.textContent = 'Normalized Ratio (%)';
        
        // Insert after "% of Sequences" column
        const percentColumn = tableHeader.querySelector('th:nth-child(4)');
        if (percentColumn) {
            percentColumn.insertAdjacentElement('afterend', normalizedHeader);
        } else {
            // Fallback: append it to the end before the actions column
            const actionsColumn = tableHeader.querySelector('th:last-child');
            if (actionsColumn) {
                actionsColumn.insertAdjacentElement('beforebegin', normalizedHeader);
            }
        }
    }
    
    tableBody.innerHTML = '';
    
    // Handle both array and map inputs, and normalize property names
    let data;
    if (Array.isArray(bindingDomainStats)) {
        // Server returns array with snake_case properties
        data = bindingDomainStats.map(d => ({
            domain: d.domain,
            bindingCount: d.binding_count || 0,
            sequenceCount: d.sequence_count || 0,
            avgAffinity: d.avg_affinity || 0,
            avgBitScore: d.avg_bitscore || 0,
            normalizedRatio: d.normalized_ratio || 0,
            noMetagenomeData: d.no_metagenome_data || false
        }));
    } else {
        // Client-side analysis returns Map with camelCase properties
        data = Array.from(bindingDomainStats.values());
    }
    
    // Sort by binding count (descending)
    data.sort((a, b) => b.bindingCount - a.bindingCount);
    
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No binding domains found with current filters.</td></tr>';
        return;
    }
    
    // Create table rows
    data.forEach(domain => {
        // Calculate percentage of sequences
        const percentOfSequences = totalSequences ? 
            ((domain.sequenceCount / totalSequences) * 100).toFixed(2) : 
            'N/A';
        
        // Format normalized ratio for display
        let normalizedRatioDisplay;
        if (domain.noMetagenomeData) {
            normalizedRatioDisplay = 'N/A <span class="badge bg-warning text-dark" title="No metagenome data for this domain">!</span>';
        } else {
            normalizedRatioDisplay = (domain.normalizedRatio * 100).toFixed(2) + '%';
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${domain.domain}</td>
            <td>${domain.bindingCount}</td>
            <td>${domain.sequenceCount}</td>
            <td>${percentOfSequences}%</td>
            <td>${normalizedRatioDisplay}</td>
            <td>${domain.avgAffinity.toFixed(2)}</td>
            <td>${domain.avgBitScore.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-domain-btn" data-domain="${domain.domain}">
                    <i class="bi bi-search"></i> View
                </button>
                <a href="http://pfam.xfam.org/family/${domain.domain}" target="_blank" class="btn btn-sm btn-outline-info ms-1">
                    <i class="bi bi-box-arrow-up-right"></i> PFAM
                </a>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Update binding domains count badge
    const countBadge = document.getElementById('binding-domains-count');
    if (countBadge) {
        countBadge.textContent = `${data.length} domains`;
    }
}

// Create binding domains heatmap
function createBindingHeatmap(data, containerId) {
    if (!data || data.length === 0) {
        document.getElementById(containerId).innerHTML = '<p>No binding domain data available for heatmap.</p>';
        return;
    }
    
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    // Get unique domains for matrix
    const domains = Array.from(new Set([
        ...data.map(d => d.source),
        ...data.map(d => d.target)
    ])).sort();
    
    // Create matrix from pairs
    const matrix = [];
    for (let i = 0; i < domains.length; i++) {
        const row = [];
        for (let j = 0; j < domains.length; j++) {
            const pair = data.find(d => 
                (d.source === domains[i] && d.target === domains[j]) || 
                (d.source === domains[j] && d.target === domains[i])
            );
            row.push(pair ? pair.score : 0);
        }
        matrix.push(row);
    }
    
    // Dimensions and margins
    const margin = {top: 80, right: 50, bottom: 80, left: 100};
    const size = Math.min(800, Math.max(400, domains.length * 40));
    const width = size - margin.left - margin.right;
    const height = size - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Create scales
    const x = d3.scaleBand()
        .range([0, width])
        .domain(domains)
        .padding(0.05);
    
    const y = d3.scaleBand()
        .range([height, 0])
        .domain(domains)
        .padding(0.05);
    
    // Color scale for heatmap
    const maxScore = d3.max(data, d => d.score);
    const color = d3.scaleSequential()
        .interpolator(d3.interpolateYlOrRd)
        .domain([0, maxScore]);
    
    // Create heatmap cells
    svg.selectAll()
        .data(data)
        .join('rect')
        .attr('x', d => x(d.source || 'unknown'))
        .attr('y', d => y(d.target || 'unknown'))
        .attr('width', x.bandwidth())
        .attr('height', y.bandwidth())
        .style('fill', d => color(d.score || 0))
        .attr('data-bs-toggle', 'tooltip')
        .attr('title', d => `${d.source || 'Unknown'} - ${d.target || 'Unknown'}: ${(d.score || 0).toFixed(2)}`);
    
    // Add axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .text('Domain-Domain Interaction Heatmap');
    
    // Initialize tooltips
    try {
        const tooltipTriggerList = document.querySelectorAll(`#${containerId} [data-bs-toggle="tooltip"]`);
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    } catch (e) {
        console.warn("Bootstrap tooltips initialization failed:", e);
    }
    
    // Add export button
    const exportButtonId = `export-${containerId}`;
    const exportButton = document.createElement('button');
    exportButton.id = exportButtonId;
    exportButton.className = 'btn btn-outline-primary btn-sm mt-2';
    exportButton.innerHTML = '<i class="bi bi-download"></i> Export as PNG';
    container.appendChild(exportButton);
    
    // Event listener for export button
    document.getElementById(exportButtonId).addEventListener('click', () => {
        exportChartAsPng(
            document.querySelector(`#${containerId} svg`),
            'binding-domains-heatmap.png',
            exportButtonId
        );
    });
}

// Create binding domains network
function createBindingNetwork(data, containerId) {
    if (!data || data.length === 0) {
        document.getElementById(containerId).innerHTML = '<p>No binding domain data available for network.</p>';
        return;
    }
    
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    // Get unique nodes and create proper format for force directed graph
    const nodes = Array.from(new Set([
        ...data.map(d => d.source),
        ...data.map(d => d.target)
    ])).map(id => ({ id }));
    
    const links = data.map(d => ({
        source: d.source,
        target: d.target,
        value: d.score
    }));
    
    // Dimensions
    const width = 800;
    const height = 600;
    
    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // Add zoom functionality
    const g = svg.append('g');
    
    svg.call(d3.zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.1, 8])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        })
    );
    
    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(30));
    
    // Create links
    const link = g.append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('stroke-width', d => Math.sqrt(d.value))
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6);
    
    // Create nodes
    const node = g.append('g')
        .selectAll('circle')
        .data(nodes)
        .join('circle')
        .attr('r', 8)
        .attr('fill', '#69b3a2')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .call(drag(simulation))
        .attr('data-bs-toggle', 'tooltip')
        .attr('title', d => d.id);
    
    // Add labels
    const labels = g.append('g')
        .selectAll('text')
        .data(nodes)
        .join('text')
        .text(d => d.id)
        .attr('font-size', 10)
        .attr('dx', 12)
        .attr('dy', 4);
    
    // Update positions
    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
            
        node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
            
        labels
            .attr('x', d => d.x)
            .attr('y', d => d.y);
    });
    
    // Drag functions
    function drag(simulation) {
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        
        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }
    
    // Initialize tooltips
    try {
        const tooltipTriggerList = document.querySelectorAll(`#${containerId} [data-bs-toggle="tooltip"]`);
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    } catch (e) {
        console.warn("Bootstrap tooltips initialization failed:", e);
    }
    
    // Add export button
    const exportButtonId = `export-${containerId}-network`;
    const exportButton = document.createElement('button');
    exportButton.id = exportButtonId;
    exportButton.className = 'btn btn-outline-primary btn-sm mt-2';
    exportButton.innerHTML = '<i class="bi bi-download"></i> Export as PNG';
    container.appendChild(exportButton);
    
    // Event listener for export button
    document.getElementById(exportButtonId).addEventListener('click', () => {
        exportChartAsPng(
            document.querySelector(`#${containerId} svg`),
            'binding-domains-network.png',
            exportButtonId
        );
    });
    
    return simulation;
}

// Poll for task status updates with exponential backoff
function pollTaskStatus(taskId) {
    let pollInterval = 1000; // Start with 1 second
    const maxInterval = 10000; // Cap at 10 seconds
    const timeout = 5 * 60 * 1000; // 5 minute timeout
    const startTime = Date.now();
    let attempts = 0;
    
    // Cache DOM elements to avoid repeated lookups
    const progressBar = document.getElementById('binding-domains-progress-bar');
    const progressStatus = document.getElementById('binding-domains-progress-status');
    
    function poll() {
        // Check if we've exceeded our timeout
        if (Date.now() - startTime > timeout) {
            progressStatus.innerHTML = 
                `<div class="alert alert-warning">Analysis timed out after ${Math.round(timeout/1000/60)} minutes. The task may still be running in the background.</div>`;
            progressBar.classList.remove('progress-bar-animated');
            return;
        }
        
        fetch(`/api/binding_domains_status/${taskId}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                
                // Update progress bar with cached DOM elements
                updateProgressBar(data.progress, getProgressStatusText(data.progress), progressBar, progressStatus);
                
                if (data.status === 'completed') {
                    // Analysis completed successfully
                    console.log("Analysis completed successfully");
                    handleCompletedAnalysis(data.result);
                } else if (data.status === 'error') {
                    // Analysis failed - use cached DOM references
                    progressStatus.innerHTML = 
                        `<div class="alert alert-danger">Error: ${data.error}</div>`;
                    progressBar.classList.remove('progress-bar-animated');
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-danger');
                } else {
                    // Still running, continue polling with increasing interval
                    attempts++;
                    // Implement exponential backoff (increase interval up to max)
                    pollInterval = Math.min(pollInterval * 1.5, maxInterval);
                    console.log(`Polling again in ${pollInterval}ms (attempt ${attempts})`);
                    setTimeout(poll, pollInterval);
                }
            })
            .catch(error => {
                console.error('Error polling task status:', error);
                // Show error with cached DOM references
                progressStatus.innerHTML = 
                    `<div class="alert alert-danger">Error: ${error.message}</div>`;
                progressBar.classList.remove('progress-bar-animated');
                progressBar.classList.remove('bg-primary');
                progressBar.classList.add('bg-danger');
            });
    }
    
    // Start polling
    poll();
}

// Update progress bar with optional DOM element caching for better performance
function updateProgressBar(progress, statusText, progressBar, statusElement) {
    // Use provided elements or fall back to document lookup
    const bar = progressBar || document.getElementById('binding-domains-progress-bar');
    const status = statusElement || document.getElementById('binding-domains-progress-status');
    
    // Update progress percentage
    bar.style.width = `${progress}%`;
    bar.setAttribute('aria-valuenow', progress);
    bar.textContent = `${progress}%`;
    
    // Update status text
    if (statusText) {
        status.textContent = statusText;
    }
}

// Get status text based on progress percentage
function getProgressStatusText(progress) {
    if (progress < 10) {
        return 'Initializing analysis...';
    } else if (progress < 40) {
        return 'Preprocessing sequence data...';
    } else if (progress < 90) {
        return 'Analyzing domain-binding intersections...';
    } else {
        return 'Finalizing results...';
    }
}

// Handle completed analysis
function handleCompletedAnalysis(result) {
    // Update stored binding domains data
    window.enrichmentData.bindingDomainsData = result;
    
    // Hide progress bar and show results
    document.getElementById('binding-domains-progress-card').style.display = 'none';
    document.getElementById('binding-domains-results-card').style.display = 'block';
    document.getElementById('binding-domains-table-card').style.display = 'block';
    
    // Ensure we have chart containers for both views
    const resultsCard = document.getElementById('binding-domains-results-card');
    if (resultsCard) {
        // Check if we need to add chart containers and toggle buttons
        if (!document.getElementById('binding-view-controls')) {
            // Create view controls
            const viewControls = document.createElement('div');
            viewControls.id = 'binding-view-controls';
            viewControls.className = 'btn-group mb-3';
            viewControls.innerHTML = `
                <button type="button" class="btn btn-outline-primary active" id="raw-count-view-btn">
                    Raw Count View
                </button>
                <button type="button" class="btn btn-outline-primary" id="normalized-view-btn">
                    Normalized View
                </button>
            `;
            
            // Find the right place to insert the controls
            const cardHeader = resultsCard.querySelector('.card-header');
            if (cardHeader) {
                cardHeader.appendChild(viewControls);
            } else {
                // Fallback: insert at beginning of card body
                const cardBody = resultsCard.querySelector('.card-body');
                if (cardBody) {
                    cardBody.insertAdjacentElement('afterbegin', viewControls);
                }
            }
            
            // Create container for normalized chart
            const chartContainer = document.getElementById('binding-domains-chart').parentElement;
            const normalizedContainer = document.createElement('div');
            normalizedContainer.id = 'normalized-binding-chart-container';
            normalizedContainer.className = chartContainer.className;
            normalizedContainer.style.display = 'none'; // Hide initially
            
            // Create chart container
            const normalizedChart = document.createElement('div');
            normalizedChart.id = 'normalized-binding-chart';
            normalizedChart.className = 'chart-container';
            normalizedChart.style.height = '400px';
            
            normalizedContainer.appendChild(normalizedChart);
            chartContainer.parentElement.insertBefore(normalizedContainer, chartContainer.nextSibling);
            
            // Add event listeners for toggle buttons
            document.getElementById('raw-count-view-btn').addEventListener('click', function() {
                document.getElementById('binding-domains-chart').parentElement.style.display = 'block';
                document.getElementById('normalized-binding-chart-container').style.display = 'none';
                
                // Update button states
                this.classList.add('active');
                document.getElementById('normalized-view-btn').classList.remove('active');
            });
            
            document.getElementById('normalized-view-btn').addEventListener('click', function() {
                document.getElementById('binding-domains-chart').parentElement.style.display = 'none';
                document.getElementById('normalized-binding-chart-container').style.display = 'block';
                
                // Update button states
                this.classList.add('active');
                document.getElementById('raw-count-view-btn').classList.remove('active');
            });
        }
    }
    
    // Update visualizations
    createBindingDomainsChart(result.domain_summaries, 'binding-domains-chart');
    createNormalizedBindingChart(result.domain_summaries, 'normalized-binding-chart');
    
    // Update the binding domains table
    updateBindingDomainsTable(result.domain_summaries, 'binding-domains-table-body', result.total_sequences);
    
    // Update count badge
    const countBadge = document.getElementById('binding-domains-count');
    if (countBadge) {
        countBadge.textContent = `${result.domain_summaries.length} domains`;
    }
}

// Initialize the domain enrichment page
function initDomainEnrichment(data) {
    console.log("Domain enrichment initialization started");
    
    // Log the data structure to help with debugging
    console.log("Data structure received:", Object.keys(data));
    
    // Extract data
    const { 
        pfamEnrichment, 
        kofamEnrichment, 
        pfamDepletion,
        kofamDepletion,
        pfamExclusive,
        kofamExclusive,
        pfamDomains, 
        kofamDomains,
        allEnrichmentData,
        statistics,
        bindingDomainsData,
        defaultThresholds
    } = data;
    
    // Log counts of each data type
    console.log("Data counts:", {
        pfamEnrichment: pfamEnrichment ? pfamEnrichment.length : 0,
        kofamEnrichment: kofamEnrichment ? kofamEnrichment.length : 0,
        pfamDepletion: pfamDepletion ? pfamDepletion.length : 0,
        kofamDepletion: kofamDepletion ? kofamDepletion.length : 0,
        pfamExclusive: pfamExclusive ? pfamExclusive.length : 0,
        kofamExclusive: kofamExclusive ? kofamExclusive.length : 0,
        pfamDomains: pfamDomains ? pfamDomains.length : 0,
        kofamDomains: kofamDomains ? kofamDomains.length : 0
    });
    
    // Store the original data for filtering
    window.enrichmentData = {
        pfamEnrichment: pfamEnrichment || [],
        kofamEnrichment: kofamEnrichment || [],
        pfamDepletion: pfamDepletion || [],
        kofamDepletion: kofamDepletion || [],
        pfamExclusive: pfamExclusive || [],
        kofamExclusive: kofamExclusive || [],
        pfamDomains: pfamDomains || [],
        kofamDomains: kofamDomains || [],
        allEnrichmentData: allEnrichmentData || [],
        statistics: statistics || {},
        bindingDomainsData: bindingDomainsData || {},
        thresholds: defaultThresholds || {}
    };
    
    // Add a simple message to show it's working
    const message = document.createElement('div');
    message.className = 'alert alert-success alert-dismissible fade show';
    message.innerHTML = `
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        <p>Found: ${pfamEnrichment.length} PFAM enriched domains and ${kofamEnrichment.length} KOFAM enriched domains</p>
    `;
    
    // Insert the message at the top of the page
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(message, container.firstChild);
    }
    
    console.log("Basic functionality restored");
    
    // Create all visualizations
    try {
        console.log("Creating visualizations...");
        
        // Check if containers exist before creating visualizations
        const checkContainer = (id) => {
            const container = document.getElementById(id);
            if (!container) {
                console.warn(`Container #${id} not found in the DOM`);
                return false;
            }
            return true;
        };
        
        // Create enrichment charts if containers exist
        if (checkContainer('pfam-enrichment-chart')) {
            console.log("Creating PFAM enrichment chart...");
            
            // First try a minimal test SVG to see if D3 is working correctly
            try {
                const testContainer = d3.select('#pfam-enrichment-chart');
                
                // Clear existing content
                testContainer.html('');
                
                // Add a test SVG with a simple circle
                const testSvg = testContainer.append('svg')
                    .attr('width', 100)
                    .attr('height', 100)
                    .style('background-color', '#eee')
                    .style('margin', '10px')
                    .style('border', '1px solid #ccc');
                
                testSvg.append('circle')
                    .attr('cx', 50)
                    .attr('cy', 50)
                    .attr('r', 30)
                    .attr('fill', 'blue');
                
                console.log("Test SVG created successfully");
                
                // Now clear it again before creating the real chart
                testContainer.html('');
            } catch (e) {
                console.error("Error creating test SVG:", e);
            }
            
            createEnrichmentBarChart(
                pfamEnrichment, 
                'pfam-enrichment-chart', 
                'PFAM Enriched Domains', 
                'pfam',
                true
            );
        }
        
        if (checkContainer('kofam-enrichment-chart')) {
            console.log("Creating KOFAM enrichment chart...");
            createEnrichmentBarChart(
                kofamEnrichment, 
                'kofam-enrichment-chart', 
                'KOFAM Enriched Domains', 
                'kofam',
                true
            );
        }
        
        // Create depletion charts if data is available and containers exist
        if (checkContainer('pfam-depletion-chart')) {
            console.log("Creating PFAM depletion chart...");
            createEnrichmentBarChart(
                pfamDepletion, 
                'pfam-depletion-chart', 
                'PFAM Depleted Domains', 
                'pfam',
                false
            );
        }
        
        if (checkContainer('kofam-depletion-chart')) {
            console.log("Creating KOFAM depletion chart...");
            createEnrichmentBarChart(
                kofamDepletion, 
                'kofam-depletion-chart', 
                'KOFAM Depleted Domains', 
                'kofam',
                false
            );
        }
        
        // Create exclusive domains visualizations if containers exist
        if (checkContainer('pfam-exclusive-domains')) {
            console.log("Creating PFAM exclusive domains visualization...");
            createExclusiveDomainsViz(
                pfamExclusive,
                'pfam-exclusive-domains',
                'PFAM Exclusive Domains'
            );
        }
        
        if (checkContainer('kofam-exclusive-domains')) {
            console.log("Creating KOFAM exclusive domains visualization...");
            createExclusiveDomainsViz(
                kofamExclusive,
                'kofam-exclusive-domains',
                'KOFAM Exclusive Domains'
            );
        }
        
        // Create domain distribution chart if container exists
        if (checkContainer('domain-distribution')) {
            console.log("Creating domain distribution chart...");
            createDomainDistributionChart(
                pfamDomains,
                kofamDomains,
                'domain-distribution'
            );
        }
        
        // Create binding domains visualization if data is available and container exists
        if (bindingDomainsData && Object.keys(bindingDomainsData).length > 0 && 
            checkContainer('binding-domains-viz')) {
            console.log("Creating binding domains visualization...");
            createBindingDomainsViz(bindingDomainsData, 'binding-domains-viz');
        }
        
        console.log("All visualizations created successfully");
    } catch (error) {
        console.error("Error creating visualizations:", error);
        // Show error message
        const errorMsg = document.createElement('div');
        errorMsg.className = 'alert alert-danger';
        errorMsg.innerHTML = `
            <h4>Error Creating Visualizations</h4>
            <p>${error.message}</p>
            <pre>${error.stack}</pre>
        `;
        container.insertBefore(errorMsg, container.firstChild);
    }
    
    // Add filter controls
    addFilterControls();
    
    // Initialize binding domains analysis
    initBindingDomainsAnalysis();
}

// Check if a container exists and has dimensions
function checkContainer(id) {
    const container = document.getElementById(id);
    if (!container) {
        console.warn(`Container #${id} not found in the DOM`);
        return false;
    }
    return true;
}

// Create visualizations for a specific tab
function createVisualizationsForTab(tabId) {
    const data = window.enrichmentData;
    
    // Handle different tabs
    switch(tabId) {
        case 'pfam-tab-content':
            if (!window.pfamVisualizationsCreated) {
                console.log("Creating PFAM visualizations...");
                // Force the containers to have proper dimensions
                document.getElementById('pfam-enrichment-chart').style.height = '500px';
                document.getElementById('pfam-depletion-chart').style.height = '500px';
                
                // Create PFAM visualizations
                if (checkContainer('pfam-enrichment-chart')) {
                    createEnrichmentBarChart(
                        data.pfamEnrichment, 
                        'pfam-enrichment-chart', 
                        'PFAM Enriched Domains', 
                        'pfam',
                        true
                    );
                }
                
                if (checkContainer('pfam-depletion-chart')) {
                    createEnrichmentBarChart(
                        data.pfamDepletion, 
                        'pfam-depletion-chart', 
                        'PFAM Depleted Domains', 
                        'pfam',
                        false
                    );
                }
                
                window.pfamVisualizationsCreated = true;
            }
            break;
            
        case 'kofam-tab-content':
            if (!window.kofamVisualizationsCreated) {
                console.log("Creating KOFAM visualizations...");
                // Force the containers to have proper dimensions
                document.getElementById('kofam-enrichment-chart').style.height = '500px';
                document.getElementById('kofam-depletion-chart').style.height = '500px';
                
                // Create KOFAM visualizations
                if (checkContainer('kofam-enrichment-chart')) {
                    createEnrichmentBarChart(
                        data.kofamEnrichment, 
                        'kofam-enrichment-chart', 
                        'KOFAM Enriched Domains', 
                        'kofam',
                        true
                    );
                }
                
                if (checkContainer('kofam-depletion-chart')) {
                    createEnrichmentBarChart(
                        data.kofamDepletion, 
                        'kofam-depletion-chart', 
                        'KOFAM Depleted Domains', 
                        'kofam',
                        false
                    );
                }
                
                window.kofamVisualizationsCreated = true;
            }
            break;
            
        case 'exclusive-tab-content':
            if (!window.exclusiveVisualizationsCreated) {
                console.log("Creating exclusive domains visualizations...");
                
                // Create exclusive domains visualizations
                if (checkContainer('pfam-exclusive-domains')) {
                    createExclusiveDomainsViz(
                        data.pfamExclusive,
                        'pfam-exclusive-domains',
                        'PFAM Exclusive Domains'
                    );
                }
                
                if (checkContainer('kofam-exclusive-domains')) {
                    createExclusiveDomainsViz(
                        data.kofamExclusive,
                        'kofam-exclusive-domains',
                        'KOFAM Exclusive Domains'
                    );
                }
                
                window.exclusiveVisualizationsCreated = true;
            }
            break;
            
        case 'binding-domains-tab-content':
            if (!window.bindingDomainsVisualizationsCreated) {
                console.log("Creating binding domains visualizations...");
                
                // Create binding domains visualization
                if (data.bindingDomainsData && Object.keys(data.bindingDomainsData).length > 0 && 
                    checkContainer('binding-domains-viz')) {
                    createBindingDomainsViz(data.bindingDomainsData, 'binding-domains-viz');
                }
                
                window.bindingDomainsVisualizationsCreated = true;
            }
            break;
            
        case 'all-data-tab-content':
            if (!window.allDataTableCreated) {
                console.log("Creating all data table...");
                
                // Create all data table
                createAllDataTable(data.allEnrichmentData);
                
                window.allDataTableCreated = true;
            }
            break;
            
        default:
            // No visualizations needed for other tabs
            break;
    }
}

// Create all data table
function createAllDataTable(allData) {
    const tableBody = document.getElementById('all-domains-table-body');
    if (!tableBody) {
        console.warn("All domains table body not found");
        return;
    }
    
    tableBody.innerHTML = '';
    
    // Sort data by enrichment (descending)
    const sortedData = [...allData].sort((a, b) => b.enrichment - a.enrichment);
    
    // Create table rows
    sortedData.forEach(domain => {
        const row = document.createElement('tr');
        
        // Determine status
        let status = 'Neutral';
        if (domain.enrichment > 1.5) status = 'Enriched';
        if (domain.enrichment < 0.5) status = 'Depleted';
        if (domain.background_count === 0) status = 'Exclusive';
        
        // Determine domain type
        const type = domain.domain.startsWith('PF') ? 'PFAM' : 'KOFAM';
        
        // Create row content
        row.innerHTML = `
            <td>${domain.domain}</td>
            <td>${type}</td>
            <td>${status}</td>
            <td>${domain.enrichment ? domain.enrichment.toFixed(2) : 'N/A'}</td>
            <td>${domain.target_count}</td>
            <td>${domain.background_count}</td>
            <td>${(domain.target_fraction * 100).toFixed(2)}%</td>
            <td>${(domain.background_fraction * 100).toFixed(2)}%</td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-domain-btn" 
                       data-domain="${domain.domain}">
                    <i class="bi bi-search"></i> View
                </button>
                <a href="${type === 'PFAM' ? 
                         'http://pfam.xfam.org/family/' + domain.domain : 
                         'https://www.genome.jp/dbget-bin/www_bget?ko:' + domain.domain}" 
                   target="_blank" class="btn btn-sm btn-outline-info ms-1">
                    <i class="bi bi-box-arrow-up-right"></i> ${type}
                </a>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Add filter controls for the visualizations
function addFilterControls() {
    const filterContainer = document.getElementById('filter-controls');
    if (!filterContainer) return;
    
    filterContainer.innerHTML = '';
    
    // Create filter form
    const form = document.createElement('form');
    form.className = 'row g-3 mb-4';
    form.innerHTML = `
        <div class="col-md-4">
            <label for="p-value-threshold" class="form-label">P-value Threshold</label>
            <input type="number" class="form-control" id="p-value-threshold" 
                   value="${window.enrichmentData.thresholds.pValue || 0.05}" 
                   min="0" max="1" step="0.001">
        </div>
        <div class="col-md-4">
            <label for="fold-enrichment-threshold" class="form-label">Fold Enrichment Threshold</label>
            <input type="number" class="form-control" id="fold-enrichment-threshold" 
                   value="${window.enrichmentData.thresholds.foldEnrichment || 1.5}" 
                   min="1" step="0.1">
        </div>
        <div class="col-md-4">
            <label for="domain-filter" class="form-label">Domain Filter</label>
            <input type="text" class="form-control" id="domain-filter" placeholder="e.g., PF00001 or kinase">
        </div>
        <div class="col-12">
            <button type="button" id="apply-filters" class="btn btn-primary">Apply Filters</button>
            <button type="button" id="reset-filters" class="btn btn-outline-secondary">Reset</button>
        </div>
    `;
    
    filterContainer.appendChild(form);
    
    // Add event listeners
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('reset-filters').addEventListener('click', resetFilters);
}

// Apply filters to the data
function applyFilters() {
    const pValueThreshold = parseFloat(document.getElementById('p-value-threshold').value) || 0.05;
    const foldEnrichmentThreshold = parseFloat(document.getElementById('fold-enrichment-threshold').value) || 1.5;
    const domainFilter = document.getElementById('domain-filter').value.toLowerCase();
    
    // Filter enrichment data
    const filteredPfamEnrichment = window.enrichmentData.pfamEnrichment.filter(domain => {
        return domain.p_value <= pValueThreshold && 
               domain.fold_enrichment >= foldEnrichmentThreshold &&
               (domainFilter === '' || 
                domain.domain_id?.toLowerCase().includes(domainFilter) || 
                (domain.domain_description && domain.domain_description.toLowerCase().includes(domainFilter)) ||
                domain.domain?.toLowerCase().includes(domainFilter));
    });
    
    const filteredKofamEnrichment = window.enrichmentData.kofamEnrichment.filter(domain => {
        return domain.p_value <= pValueThreshold && 
               domain.fold_enrichment >= foldEnrichmentThreshold &&
               (domainFilter === '' || 
                domain.domain_id?.toLowerCase().includes(domainFilter) || 
                (domain.domain_description && domain.domain_description.toLowerCase().includes(domainFilter)) ||
                domain.domain?.toLowerCase().includes(domainFilter));
    });
    
    // Filter depletion data
    const filteredPfamDepletion = window.enrichmentData.pfamDepletion.filter(domain => {
        return domain.p_value <= pValueThreshold && 
               domain.fold_enrichment >= foldEnrichmentThreshold &&
               (domainFilter === '' || 
                domain.domain_id?.toLowerCase().includes(domainFilter) || 
                (domain.domain_description && domain.domain_description.toLowerCase().includes(domainFilter)) ||
                domain.domain?.toLowerCase().includes(domainFilter));
    });
    
    const filteredKofamDepletion = window.enrichmentData.kofamDepletion.filter(domain => {
        return domain.p_value <= pValueThreshold && 
               domain.fold_enrichment >= foldEnrichmentThreshold &&
               (domainFilter === '' || 
                domain.domain_id?.toLowerCase().includes(domainFilter) || 
                (domain.domain_description && domain.domain_description.toLowerCase().includes(domainFilter)) ||
                domain.domain?.toLowerCase().includes(domainFilter));
    });
    
    // Update visualizations with filtered data based on active tab
    const activeTabId = document.querySelector('.tab-pane.active').id;
    
    if (activeTabId === 'pfam-tab-content') {
        // Force the containers to have proper dimensions
        document.getElementById('pfam-enrichment-chart').style.height = '500px';
        document.getElementById('pfam-depletion-chart').style.height = '500px';
        
        if (checkContainer('pfam-enrichment-chart')) {
            createEnrichmentBarChart(
                filteredPfamEnrichment, 
                'pfam-enrichment-chart', 
                'PFAM Enriched Domains (Filtered)', 
                'pfam',
                true
            );
        }
        
        if (checkContainer('pfam-depletion-chart')) {
            createEnrichmentBarChart(
                filteredPfamDepletion, 
                'pfam-depletion-chart', 
                'PFAM Depleted Domains (Filtered)', 
                'pfam',
                false
            );
        }
    } else if (activeTabId === 'kofam-tab-content') {
        // Force the containers to have proper dimensions
        document.getElementById('kofam-enrichment-chart').style.height = '500px';
        document.getElementById('kofam-depletion-chart').style.height = '500px';
        
        if (checkContainer('kofam-enrichment-chart')) {
            createEnrichmentBarChart(
                filteredKofamEnrichment, 
                'kofam-enrichment-chart', 
                'KOFAM Enriched Domains (Filtered)', 
                'kofam',
                true
            );
        }
        
        if (checkContainer('kofam-depletion-chart')) {
            createEnrichmentBarChart(
                filteredKofamDepletion, 
                'kofam-depletion-chart', 
                'KOFAM Depleted Domains (Filtered)', 
                'kofam',
                false
            );
        }
    }
    
    // Show filter feedback
    const filterFeedback = document.createElement('div');
    filterFeedback.className = 'alert alert-info alert-dismissible fade show mt-3';
    filterFeedback.innerHTML = `
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        <h5>Filters Applied</h5>
        <p>Found ${filteredPfamEnrichment.length} PFAM enriched domains and 
           ${filteredKofamEnrichment.length} KOFAM enriched domains matching your criteria.</p>
    `;
    
    const filterContainer = document.getElementById('filter-controls');
    if (filterContainer) {
        filterContainer.appendChild(filterFeedback);
    }
}

// Reset filters
function resetFilters() {
    document.getElementById('p-value-threshold').value = window.enrichmentData.thresholds.pValue || 0.05;
    document.getElementById('fold-enrichment-threshold').value = window.enrichmentData.thresholds.foldEnrichment || 1.5;
    document.getElementById('domain-filter').value = '';
    
    // Reset visualizations to original data based on active tab
    const activeTabId = document.querySelector('.tab-pane.active').id;
    
    if (activeTabId === 'pfam-tab-content') {
        // Reset PFAM visualizations
        if (checkContainer('pfam-enrichment-chart')) {
            createEnrichmentBarChart(
                window.enrichmentData.pfamEnrichment, 
                'pfam-enrichment-chart', 
                'PFAM Enriched Domains', 
                'pfam',
                true
            );
        }
        
        if (checkContainer('pfam-depletion-chart')) {
            createEnrichmentBarChart(
                window.enrichmentData.pfamDepletion, 
                'pfam-depletion-chart', 
                'PFAM Depleted Domains', 
                'pfam',
                false
            );
        }
    } else if (activeTabId === 'kofam-tab-content') {
        // Reset KOFAM visualizations
        if (checkContainer('kofam-enrichment-chart')) {
            createEnrichmentBarChart(
                window.enrichmentData.kofamEnrichment, 
                'kofam-enrichment-chart', 
                'KOFAM Enriched Domains', 
                'kofam',
                true
            );
        }
        
        if (checkContainer('kofam-depletion-chart')) {
            createEnrichmentBarChart(
                window.enrichmentData.kofamDepletion, 
                'kofam-depletion-chart', 
                'KOFAM Depleted Domains', 
                'kofam',
                false
            );
        }
    }
    
    // Show reset message
    const resetMessage = document.createElement('div');
    resetMessage.className = 'alert alert-success alert-dismissible fade show mt-3';
    resetMessage.innerHTML = `
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        <p>Filters have been reset to default values.</p>
    `;
    
    const filterContainer = document.getElementById('filter-controls');
    if (filterContainer) {
        filterContainer.appendChild(resetMessage);
    }
}