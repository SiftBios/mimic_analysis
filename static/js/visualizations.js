// File: static/js/visualizations.js
// Handle data visualization functionality

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

// Functions for visualizing pre-aggregated data from server

// Create MHC distribution chart from pre-aggregated MHC counts
function createMHCDistributionChartFromSummary(mhcCounts) {
    const container = document.getElementById('mhc-plot');
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-mhc-summary-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'mhc-summary-svg-container';
    container.appendChild(svgContainer);
    
    // Check if we have data
    if (!mhcCounts || Object.keys(mhcCounts).length === 0) {
        svgContainer.innerHTML = '<div class="alert alert-warning">No data available for visualization.</div>';
        return;
    }
    
    // Convert to array for d3
    const chartData = Object.entries(mhcCounts)
        .map(([mhc, count]) => ({ mhc, count }))
        .sort((a, b) => b.count - a.count);
    
    // Set up dimensions
    const margin = { top: 30, right: 30, bottom: 70, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select('#mhc-summary-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'mhc-summary-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(chartData.map(d => d.mhc))
        .padding(0.2);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // Y axis
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.count) * 1.1])
        .range([height, 0]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 0 - (margin.top / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .text('MHC Distribution');
    
    // Add bars
    svg.selectAll('bars')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.mhc))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', '#5470c6');
    
    // Add count labels
    svg.selectAll('.label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.mhc) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
        
    // Add event listener for the export button
    document.getElementById('export-mhc-summary-png').addEventListener('click', function() {
        const fileName = 'mhc_distribution.png';
        const svgElement = document.getElementById('mhc-summary-svg');
        exportChartAsPng(svgElement, fileName, 'export-mhc-summary-png');
    });
}

// Create binding affinity chart from raw affinity values
function createBindingAffinityChartFromValues(affinityValues) {
    const container = document.getElementById('affinity-plot');
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-affinity-summary-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'affinity-summary-svg-container';
    container.appendChild(svgContainer);
    
    // Check if we have data
    if (!affinityValues || affinityValues.length === 0) {
        svgContainer.innerHTML = '<div class="alert alert-warning">No affinity data available for visualization.</div>';
        return;
    }
    
    // Set up dimensions
    const margin = { top: 30, right: 30, bottom: 70, left: 60 }; // Increased bottom margin for rotated labels
    const width = container.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select('#affinity-summary-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'affinity-summary-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Use log scale for x-axis (affinity values)
    const x = d3.scaleLog()
        .domain([d3.min(affinityValues) * 0.9, d3.max(affinityValues) * 1.1])
        .range([0, width]);
    
    // Add X axis with rotated labels
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d => d.toFixed(1)))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // X axis label
    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('x', width / 2)
        .attr('y', height + 60) // Adjusted for rotated labels
        .text('Affinity (nM) - log scale');
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 0 - (margin.top / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .text('Binding Affinity Distribution');
    
    // Compute histogram
    const histogram = d3.histogram()
        .value(d => d)
        .domain(x.domain())
        .thresholds(x.ticks(20));
    
    const bins = histogram(affinityValues);
    
    // Y axis
    const y = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(bins, d => d.length) * 1.1]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Y axis label
    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 15)
        .attr('x', -height / 2)
        .text('Count');
    
    // Add bars
    svg.selectAll('rect')
        .data(bins)
        .enter()
        .append('rect')
        .attr('x', d => x(d.x0))
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr('y', d => y(d.length))
        .attr('height', d => height - y(d.length))
        .style('fill', '#91cc75');
    
    // Add binding level indicators (vertical lines with annotations)
    const bindingLevels = [
        { value: 50, label: 'SB (<50nM)', color: '#91cc75', offsetX: -25 },
        { value: 500, label: 'WB (<500nM)', color: '#fac858', offsetX: -25 }
    ];
    
    // Add binding level reference lines
    bindingLevels.forEach(level => {
        if (level.value >= x.domain()[0] && level.value <= x.domain()[1]) {
            // Add line
            svg.append('line')
                .attr('x1', x(level.value))
                .attr('x2', x(level.value))
                .attr('y1', 0)
                .attr('y2', height)
                .attr('stroke', level.color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5');
            
            // Add label with offset to avoid overlap with line
            svg.append('text')
                .attr('x', x(level.value) + level.offsetX)
                .attr('y', 20)
                .attr('text-anchor', 'end')
                .attr('fill', level.color)
                .text(level.label);
        }
    });
    
    // Add event listener for the export button
    document.getElementById('export-affinity-summary-png').addEventListener('click', function() {
        const fileName = 'binding_affinity_distribution.png';
        const svgElement = document.getElementById('affinity-summary-svg');
        exportChartAsPng(svgElement, fileName, 'export-affinity-summary-png');
    });
}

// Create domain distribution chart from pre-aggregated domain summaries
function createDomainDistributionChartFromSummary(pfamDomains, kofamDomains) {
    const container = document.getElementById('domain-plot');
    container.innerHTML = '';
    
    // Add export buttons container
    const exportButtonsContainer = document.createElement('div');
    exportButtonsContainer.className = 'text-end mb-2';
    exportButtonsContainer.innerHTML = `
        <button id="export-pfam-domain-png" class="btn btn-outline-primary btn-sm me-2">
            <i class="bi bi-download"></i> Export PFAM Chart
        </button>
        <button id="export-kofam-domain-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export KOFAM Chart
        </button>
    `;
    container.appendChild(exportButtonsContainer);
    
    // Check if we have data
    if ((!pfamDomains || pfamDomains.length === 0) && (!kofamDomains || kofamDomains.length === 0)) {
        container.innerHTML = '<div class="alert alert-warning">No domain data available for visualization.</div>';
        return;
    }
    
    // Create tabs for PFAM and KOFAM
    const tabContainer = document.createElement('div');
    tabContainer.innerHTML = `
        <ul class="nav nav-tabs" id="domain-tabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="pfam-tab" data-bs-toggle="tab" 
                    data-bs-target="#pfam-content" type="button" role="tab" 
                    aria-controls="pfam-content" aria-selected="true">
                    PFAM Domains (${pfamDomains.length})
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="kofam-tab" data-bs-toggle="tab" 
                    data-bs-target="#kofam-content" type="button" role="tab" 
                    aria-controls="kofam-content" aria-selected="false">
                    KOFAM Domains (${kofamDomains.length})
                </button>
            </li>
        </ul>
        <div class="tab-content" id="domain-tabs-content">
            <div class="tab-pane fade show active" id="pfam-content" role="tabpanel" aria-labelledby="pfam-tab">
                <div id="pfam-chart" style="height: 350px;"></div>
            </div>
            <div class="tab-pane fade" id="kofam-content" role="tabpanel" aria-labelledby="kofam-tab">
                <div id="kofam-chart" style="height: 350px;"></div>
            </div>
        </div>
    `;
    
    // Add to container first, so we can attach event listeners
    container.appendChild(tabContainer);
    
    // Add tab change listener to render KOFAM chart when tab is shown
    document.getElementById('kofam-tab').addEventListener('shown.bs.tab', function() {
        console.log('KOFAM tab activated');
        // Clear existing chart
        document.getElementById('kofam-chart').innerHTML = '';
        // Render KOFAM chart now that the tab is visible
        if (kofamDomains.length > 0) {
            createDomainBarChart('kofam-chart', kofamDomains, 'Top KOFAM Domains', '#91cc75');
        } else {
            document.getElementById('kofam-content').innerHTML = '<div class="alert alert-warning mt-3">No KOFAM domains found in the selected data.</div>';
        }
    });
    
    // Create PFAM chart
    if (pfamDomains.length > 0) {
        createDomainBarChart('pfam-chart', pfamDomains, 'Top PFAM Domains', '#5470c6');
    } else {
        document.getElementById('pfam-content').innerHTML = '<div class="alert alert-warning mt-3">No PFAM domains found in the selected data.</div>';
    }
    
    // Add event listeners for the export buttons
    document.getElementById('export-pfam-domain-png').addEventListener('click', function() {
        const fileName = 'pfam_domains.png';
        const svgElement = document.getElementById('pfam-chart-svg');
        exportChartAsPng(svgElement, fileName, 'export-pfam-domain-png');
    });
    
    document.getElementById('export-kofam-domain-png').addEventListener('click', function() {
        const fileName = 'kofam_domains.png';
        const svgElement = document.getElementById('kofam-chart-svg');
        exportChartAsPng(svgElement, fileName, 'export-kofam-domain-png');
    });
}

// Helper function for domain bar charts from pre-aggregated data
function createDomainBarChart(containerId, domainData, title, color) {
    const container = document.getElementById(containerId);
    
    if (container.clientWidth === 0 || container.clientHeight === 0) {
        console.error(`Container ${containerId} has zero width or height. Aborting chart creation.`);
        return;
    }
    
    // Set up dimensions
    const margin = { top: 30, right: 30, bottom: 120, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;
    
    // Create SVG with unique ID based on container
    const svgId = `${containerId}-svg`;
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', svgId)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(domainData.map(d => d.domain))
        .padding(0.2);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // Y axis
    const y = d3.scaleLinear()
        .domain([0, d3.max(domainData, d => d.count) * 1.1])
        .range([height, 0]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 0 - (margin.top / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .text(title);
    
    // Add bars
    svg.selectAll('bars')
        .data(domainData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.domain))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', color);
    
    // Add count labels
    svg.selectAll('.label')
        .data(domainData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.domain) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
}

// Create MHC distribution chart
function createMHCDistributionChart(data) {
    const container = document.getElementById('mhc-plot');
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-mhc-data-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'mhc-data-svg-container';
    container.appendChild(svgContainer);
    
    // Check if we have data
    if (!data || data.length === 0) {
        svgContainer.innerHTML = '<div class="alert alert-warning">No data selected for visualization.</div>';
        return;
    }
    
    // Count MHC types
    const mhcCounts = {};
    data.forEach(row => {
        const mhc = row.MHC || 'Unknown';
        if (!mhcCounts[mhc]) {
            mhcCounts[mhc] = 0;
        }
        mhcCounts[mhc]++;
    });
    
    // Convert to array for d3
    const chartData = Object.entries(mhcCounts)
        .map(([mhc, count]) => ({ mhc, count }))
        .sort((a, b) => b.count - a.count);
    
    // Set up dimensions
    const margin = { top: 30, right: 30, bottom: 70, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select('#mhc-data-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'mhc-data-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(chartData.map(d => d.mhc))
        .padding(0.2);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // Y axis
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.count) * 1.1])
        .range([height, 0]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 0 - (margin.top / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .text('MHC Distribution');
    
    // Add bars
    svg.selectAll('bars')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.mhc))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', '#5470c6');
    
    // Add count labels
    svg.selectAll('.label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.mhc) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
        
    // Add event listener for the export button
    document.getElementById('export-mhc-data-png').addEventListener('click', function() {
        const fileName = 'mhc_distribution_filtered.png';
        const svgElement = document.getElementById('mhc-data-svg');
        exportChartAsPng(svgElement, fileName, 'export-mhc-data-png');
    });
}

// Create binding affinity distribution chart
function createBindingAffinityChart(data) {
    const container = document.getElementById('affinity-plot');
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-affinity-data-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'affinity-data-svg-container';
    container.appendChild(svgContainer);
    
    // Check if we have data
    if (!data || data.length === 0) {
        svgContainer.innerHTML = '<div class="alert alert-warning">No data selected for visualization.</div>';
        return;
    }
    
    // Extract affinity values
    const affinityValues = data
        .filter(row => row['mimic_Aff(nM)'] !== undefined && row['mimic_Aff(nM)'] !== null)
        .map(row => parseFloat(row['mimic_Aff(nM)']));
    
    if (affinityValues.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No affinity data available in the selected rows.</div>';
        return;
    }
    
    // Set up dimensions
    const margin = { top: 30, right: 30, bottom: 70, left: 60 }; // Increased bottom margin for rotated labels
    const width = container.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select('#affinity-data-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'affinity-data-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Use log scale for x-axis (affinity values)
    const x = d3.scaleLog()
        .domain([d3.min(affinityValues) * 0.9, d3.max(affinityValues) * 1.1])
        .range([0, width]);
    
    // Add X axis with rotated labels
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d => d.toFixed(1)))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // X axis label
    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('x', width / 2)
        .attr('y', height + 60) // Adjusted for rotated labels
        .text('Affinity (nM) - log scale');
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 0 - (margin.top / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .text('Binding Affinity Distribution');
    
    // Compute histogram
    const histogram = d3.histogram()
        .value(d => d)
        .domain(x.domain())
        .thresholds(x.ticks(20));
    
    const bins = histogram(affinityValues);
    
    // Y axis
    const y = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(bins, d => d.length) * 1.1]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Y axis label
    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 15)
        .attr('x', -height / 2)
        .text('Count');
    
    // Add bars
    svg.selectAll('rect')
        .data(bins)
        .enter()
        .append('rect')
        .attr('x', d => x(d.x0))
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr('y', d => y(d.length))
        .attr('height', d => height - y(d.length))
        .style('fill', '#91cc75');
    
    // Add binding level indicators (vertical lines with annotations)
    const bindingLevels = [
        { value: 50, label: 'SB (<50nM)', color: '#91cc75', offsetX: -25 },
        { value: 500, label: 'WB (<500nM)', color: '#fac858', offsetX: -25 }
    ];
    
    // Add binding level reference lines
    bindingLevels.forEach(level => {
        if (level.value >= x.domain()[0] && level.value <= x.domain()[1]) {
            // Add line
            svg.append('line')
                .attr('x1', x(level.value))
                .attr('x2', x(level.value))
                .attr('y1', 0)
                .attr('y2', height)
                .attr('stroke', level.color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5');
            
            // Add label with offset to avoid overlap with line
            svg.append('text')
                .attr('x', x(level.value) + level.offsetX)
                .attr('y', 20)
                .attr('text-anchor', 'end')
                .attr('fill', level.color)
                .text(level.label);
        }
    });
    
    // Add event listener for the export button
    document.getElementById('export-affinity-data-png').addEventListener('click', function() {
        const fileName = 'binding_affinity_filtered.png';
        const svgElement = document.getElementById('affinity-data-svg');
        exportChartAsPng(svgElement, fileName, 'export-affinity-data-png');
    });
}

// Create domain distribution chart
function createDomainDistributionChart(data) {
    const container = document.getElementById('domain-plot');
    container.innerHTML = '';
    
    // Add export buttons container
    const exportButtonsContainer = document.createElement('div');
    exportButtonsContainer.className = 'text-end mb-2';
    exportButtonsContainer.innerHTML = `
        <button id="export-pfam-data-png" class="btn btn-outline-primary btn-sm me-2">
            <i class="bi bi-download"></i> Export PFAM Chart
        </button>
        <button id="export-kofam-data-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export KOFAM Chart
        </button>
    `;
    container.appendChild(exportButtonsContainer);
    
    // Check if we have data
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No data selected for visualization.</div>';
        return;
    }
    
    // Extract domain data
    const pfamCounts = {};
    const kofamCounts = {};
    
    // Process PFAM domains
    data.forEach(row => {
        try {
            if (row.PFAM_domains) {
                const domains = JSON.parse(row.PFAM_domains);
                domains.forEach(domain => {
                    const hmmName = domain.hmm_name;
                    if (!pfamCounts[hmmName]) {
                        pfamCounts[hmmName] = 0;
                    }
                    pfamCounts[hmmName]++;
                });
            }
        } catch (e) {
            console.error('Error parsing PFAM domains:', e);
        }
    });
    
    // Process KOFAM domains
    let totalKofamDomains = 0;
    data.forEach(row => {
        try {
            if (row.KOFAM_domains) {
                const domains = JSON.parse(row.KOFAM_domains);
                console.log(`KOFAM domains for row:`, domains);
                totalKofamDomains += domains.length;
                domains.forEach(domain => {
                    const hmmName = domain.hmm_name;
                    if (!kofamCounts[hmmName]) {
                        kofamCounts[hmmName] = 0;
                    }
                    kofamCounts[hmmName]++;
                });
            }
        } catch (e) {
            console.error('Error parsing KOFAM domains:', e, row.KOFAM_domains);
        }
    });
    console.log(`Total KOFAM domains found: ${totalKofamDomains}, Unique types: ${Object.keys(kofamCounts).length}`);
    
    // Sort domains by count
    const pfamData = Object.entries(pfamCounts)
        .map(([domain, count]) => ({ domain, count, type: 'PFAM' }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15); // Show top 15
    
    const kofamData = Object.entries(kofamCounts)
        .map(([domain, count]) => ({ domain, count, type: 'KOFAM' }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15); // Show top 15
    
    // Create tabs for PFAM and KOFAM
    const tabContainer = document.createElement('div');
    tabContainer.innerHTML = `
        <ul class="nav nav-tabs" id="domain-tabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="pfam-tab" data-bs-toggle="tab" 
                    data-bs-target="#pfam-content" type="button" role="tab" 
                    aria-controls="pfam-content" aria-selected="true">
                    PFAM Domains (${Object.keys(pfamCounts).length})
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="kofam-tab" data-bs-toggle="tab" 
                    data-bs-target="#kofam-content" type="button" role="tab" 
                    aria-controls="kofam-content" aria-selected="false">
                    KOFAM Domains (${Object.keys(kofamCounts).length})
                </button>
            </li>
        </ul>
        <div class="tab-content" id="domain-tabs-content">
            <div class="tab-pane fade show active" id="pfam-content" role="tabpanel" aria-labelledby="pfam-tab">
                <div id="pfam-chart" style="height: 350px;"></div>
            </div>
            <div class="tab-pane fade" id="kofam-content" role="tabpanel" aria-labelledby="kofam-tab">
                <div id="kofam-chart" style="height: 350px;"></div>
            </div>
        </div>
    `;
    
    // Add to container first, so we can attach event listeners
    container.appendChild(tabContainer);
    
    // Add tab change listener to render KOFAM chart when tab is shown
    document.getElementById('kofam-tab').addEventListener('shown.bs.tab', function() {
        console.log('KOFAM tab activated');
        // Clear existing chart
        document.getElementById('kofam-chart').innerHTML = '';
        // Render KOFAM chart now that the tab is visible
        if (kofamData.length > 0) {
            createBarChart('kofam-chart', kofamData, 'Top KOFAM Domains', '#91cc75');
        } else {
            document.getElementById('kofam-content').innerHTML = '<div class="alert alert-warning mt-3">No KOFAM domains found in the selected data.</div>';
        }
    });
    
    // Create PFAM chart
    if (pfamData.length > 0) {
        createBarChart('pfam-chart', pfamData, 'Top PFAM Domains', '#5470c6');
    } else {
        document.getElementById('pfam-content').innerHTML = '<div class="alert alert-warning mt-3">No PFAM domains found in the selected data.</div>';
    }
    
    // Create KOFAM chart
    if (kofamData.length > 0) {
        // Add a small delay to ensure the container is visible and has dimensions when rendering
        setTimeout(() => {
            createBarChart('kofam-chart', kofamData, 'Top KOFAM Domains', '#91cc75');
        }, 100);
    } else {
        document.getElementById('kofam-content').innerHTML = '<div class="alert alert-warning mt-3">No KOFAM domains found in the selected data.</div>';
    }
    
    // Add event listeners for the export buttons
    document.getElementById('export-pfam-data-png').addEventListener('click', function() {
        const fileName = 'pfam_domains_filtered.png';
        const svgElement = document.getElementById('pfam-chart-svg');
        exportChartAsPng(svgElement, fileName, 'export-pfam-data-png');
    });
    
    document.getElementById('export-kofam-data-png').addEventListener('click', function() {
        const fileName = 'kofam_domains_filtered.png';
        const svgElement = document.getElementById('kofam-chart-svg');
        exportChartAsPng(svgElement, fileName, 'export-kofam-data-png');
    });
}

// Helper function to create a bar chart
function createBarChart(containerId, data, title, color) {
    const container = document.getElementById(containerId);
    
    console.log(`Creating chart in container ${containerId}`);
    console.log(`Container dimensions: Width=${container.clientWidth}, Height=${container.clientHeight}`);
    
    if (container.clientWidth === 0 || container.clientHeight === 0) {
        console.error(`Container ${containerId} has zero width or height. Aborting chart creation.`);
        return;
    }
    
    // Set up dimensions
    const margin = { top: 30, right: 30, bottom: 120, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;
    
    console.log(`Chart dimensions: Width=${width}, Height=${height}`);
    
    // Create SVG with unique ID based on container
    const svgId = `${containerId}-svg`;
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', svgId)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(data.map(d => d.domain))
        .padding(0.2);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // Y axis
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) * 1.1])
        .range([height, 0]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Add title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 0 - (margin.top / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .text(title);
    
    // Add bars
    svg.selectAll('bars')
        .data(data)
        .enter()
        .append('rect')
        .attr('x', d => x(d.domain))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', color);
    
    // Add count labels
    svg.selectAll('.label')
        .data(data)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.domain) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
}
