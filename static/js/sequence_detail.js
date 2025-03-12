// File: static/js/sequence_detail.js
// JavaScript for the sequence detail page visualizations

// Initialize the sequence detail page
function initSequenceDetail(data) {
    // Extract data
    const { 
        sequenceId, 
        pfamDomains, 
        kofamDomains, 
        pfamMetagenomeDomains, 
        kofamMetagenomeDomains, 
        bindingData, 
        bindingPositions, 
        sequence, 
        sequenceLength 
    } = data;
    
    // Set defaults
    const defaultSequenceLength = 1000; // Default length if we don't have the actual sequence
    const actualLength = sequenceLength || (sequence ? sequence.length : defaultSequenceLength);
    
    // Create domain architecture visualization
    createDomainArchitecture(
        pfamDomains, 
        kofamDomains, 
        pfamMetagenomeDomains, 
        kofamMetagenomeDomains, 
        actualLength
    );
    
    // Create binding position histogram if we have data
    if (bindingPositions && bindingPositions.length > 0) {
        createBindingPositionHistogram(bindingPositions, actualLength);
    } else if (bindingData && bindingData.length > 0) {
        // Show a message if no position data available but we do have binding data
        document.getElementById('binding-position-histogram').innerHTML = 
            '<div class="alert alert-info">Binding position data not available for this sequence.</div>';
    } else {
        // No binding data at all
        document.getElementById('binding-position-histogram').innerHTML = 
            '<div class="alert alert-light">No binding data available for this sequence.</div>';
    }
    
    // Create binding distribution chart if we have binding data
    if (bindingData && bindingData.length > 0) {
        createBindingDistributionChart(bindingData);
        
        // Initialize the binding data filters and interactive features
        initBindingDataFilters(bindingData);
    }
}

// Create domain architecture visualization using D3
function createDomainArchitecture(pfamDomains, kofamDomains, pfamMetagenomeDomains, kofamMetagenomeDomains, sequenceLength) {
    const container = document.getElementById('domain-visual');
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-domain-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'domain-visual-svg-container';
    container.appendChild(svgContainer);
    
    // Check if we have domains
    const hasPfamDomains = pfamDomains && pfamDomains.length > 0;
    const hasKofamDomains = kofamDomains && kofamDomains.length > 0;
    const hasPfamMetaDomains = pfamMetagenomeDomains && pfamMetagenomeDomains.length > 0;
    const hasKofamMetaDomains = kofamMetagenomeDomains && kofamMetagenomeDomains.length > 0;
    
    if (!hasPfamDomains && !hasKofamDomains && !hasPfamMetaDomains && !hasKofamMetaDomains) {
        svgContainer.innerHTML = '<div class="alert alert-light">No domain information available for this sequence.</div>';
        return;
    }
    
    // We'll show max 2 rows - PFAM and KOFAM (for better binders)
    // Changed: Use only PFAM and KOFAM instead of showing PFAM domains from two sources
    const rowCount = [(hasPfamDomains || hasPfamMetaDomains), (hasKofamDomains || hasKofamMetaDomains)].filter(Boolean).length;
    
    // Set up dimensions - increased bottom margin for x-axis label
    const margin = { top: 40, right: 20, bottom: 70, left: 80 };
    const width = container.clientWidth - margin.left - margin.right;
    const rowHeight = 35; // Height of each domain row
    const rowGap = 30; // Gap between domain rows
    
    // Calculate total height for domain visualization
    const fullHeight = (rowCount * rowHeight) + ((rowCount - 1) * rowGap);
    const height = fullHeight + margin.top + margin.bottom;
    
    // Scale for the protein length
    const xScale = d3.scaleLinear()
        .domain([0, sequenceLength])
        .range([0, width]);
    
    // Create SVG
    const svg = d3.select('#domain-visual-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height)
        .attr('id', 'domain-architecture-svg') // Add ID for easy selection
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Create tooltip div
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Domain colors
    const domainColors = {
        'PFAM': '#5470c6',
        'KOFAM': '#91cc75'
    };
    
    // Row tracking
    let currentRow = 0;
    const rowPositions = {};
    
    // Function to add a row with backbone and label
    function addRowWithBackbone(rowName, rowType) {
        // Store this row position
        const yPos = currentRow * (rowHeight + rowGap) + rowHeight/2;
        rowPositions[rowType] = yPos;
        
        // Add row label
        svg.append('text')
            .attr('x', -65)
            .attr('y', yPos + 5)
            .attr('text-anchor', 'start')
            .attr('font-weight', 'bold')
            .text(rowName);
        
        // Add backbone
        svg.append('rect')
            .attr('x', 0)
            .attr('y', yPos - 5)
            .attr('width', width)
            .attr('height', 10)
            .attr('rx', 5)
            .attr('ry', 5)
            .attr('fill', '#e0e0e0');
        
        // Increment row counter
        currentRow++;
    }
    
    // Add rows with backbones - show only PFAM and KOFAM rows
    if (hasPfamDomains || hasPfamMetaDomains) {
        addRowWithBackbone('PFAM', 'PFAM');
    }
    
    if (hasKofamDomains || hasKofamMetaDomains) {
        addRowWithBackbone('KOFAM', 'KOFAM');
    }
    
    // Helper function to add domains to a row
    function addDomainsToRow(domains, rowType, source = '') {
        if (!domains || domains.length === 0) return;
        
        const yPos = rowPositions[rowType];
        
        svg.selectAll(`.domain-${rowType.toLowerCase()}-${source}`)
            .data(domains)
            .enter()
            .append('rect')
            .attr('class', `protein-domain domain-${rowType.toLowerCase()}`)
            .attr('x', d => xScale(d.start))
            .attr('y', yPos - 15)
            .attr('width', d => Math.max(5, xScale(d.end) - xScale(d.start)))
            .attr('height', 30)
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('fill', domainColors[rowType])
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .on('mouseover', function(event, d) {
                d3.select(this)
                    .attr('stroke', '#000')
                    .attr('stroke-width', 2);
                    
                tooltip.transition()
                    .duration(200)
                    .style('opacity', 0.9);
                    
                tooltip.html(`
                    <strong>${d.hmm_name}</strong><br/>
                    Type: ${rowType}${source ? ' (' + source + ')' : ''}<br/>
                    Position: ${d.start} - ${d.end}<br/>
                    Bit Score: ${d.bitscore.toFixed(2)}<br/>
                    E-value: ${d.e_value.toExponential(2)}
                `)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 28) + 'px');
            })
            .on('mouseout', function() {
                d3.select(this)
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 1);
                    
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);
            });
    }
    
    // Add domains to each row - now we display both binder and metagenome domains on the same row
    if (hasPfamDomains) {
        addDomainsToRow(pfamDomains, 'PFAM', 'Binder');
    }
    
    if (hasPfamMetaDomains) {
        addDomainsToRow(pfamMetagenomeDomains, 'PFAM', 'Metagenome');
    }
    
    if (hasKofamDomains) {
        addDomainsToRow(kofamDomains, 'KOFAM', 'Binder');
    }
    
    if (hasKofamMetaDomains) {
        addDomainsToRow(kofamMetagenomeDomains, 'KOFAM', 'Metagenome');
    }
    
    // Add position markers (shared x-axis)
    const tickValues = [];
    for (let i = 0; i <= sequenceLength; i += Math.ceil(sequenceLength / 10)) {
        tickValues.push(i);
    }
    
    const xAxis = d3.axisBottom(xScale)
        .tickValues(tickValues)
        .tickFormat(d => d);
        
    svg.append('g')
        .attr('transform', `translate(0,${fullHeight + 20})`)
        .call(xAxis);
    
    // Add axis label - moved down to avoid overlap with tick labels
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', fullHeight + 55)
        .attr('text-anchor', 'middle')
        .text('Amino Acid Position');
    
    // Add legend with PFAM and KOFAM domain types - moved higher to avoid overlap
    const legend = svg.append('g')
        .attr('transform', `translate(${width - 180}, -35)`);
        
    const legendItems = [];
    
    if (hasPfamDomains || hasPfamMetaDomains) {
        legendItems.push({ type: 'PFAM', label: 'PFAM Domains' });
    }
    
    if (hasKofamDomains || hasKofamMetaDomains) {
        legendItems.push({ type: 'KOFAM', label: 'KOFAM Domains' });
    }
    
    legend.selectAll('rect')
        .data(legendItems)
        .enter()
        .append('rect')
        .attr('x', 0)
        .attr('y', (d, i) => i * 20)
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', d => domainColors[d.type]);
        
    legend.selectAll('text')
        .data(legendItems)
        .enter()
        .append('text')
        .attr('x', 20)
        .attr('y', (d, i) => i * 20 + 12)
        .text(d => d.label)
        .attr('font-size', 12);
        
    // Add event listener for the export button
    document.getElementById('export-domain-png').addEventListener('click', function() {
        // Get sequence ID from the page to use in filename
        const sequenceId = document.querySelector('.sequence-title h3')?.textContent.trim() || 'sequence';
        const fileName = `${sequenceId}_domain_architecture.png`;
        
        // Get the SVG element and export it
        const svgElement = document.getElementById('domain-architecture-svg');
        exportChartAsPng(svgElement, fileName, 'export-domain-png');
    });
}

// Create binding position histogram using D3
function createBindingPositionHistogram(bindingPositions, sequenceLength) {
    const container = document.getElementById('binding-position-histogram');
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-binding-pos-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'binding-histogram-svg-container';
    container.appendChild(svgContainer);
    
    // Set up dimensions
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 120;
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;
    
    // Add title for the histogram
    d3.select('#binding-histogram-svg-container')
        .append('div')
        .attr('class', 'text-center text-muted mb-2')
        .html('<small>Distribution of mimic binding sites along the protein sequence</small>');
    
    // Create SVG
    const svg = d3.select('#binding-histogram-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'binding-histogram-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Scale for the protein length (x-axis)
    const xScale = d3.scaleLinear()
        .domain([0, sequenceLength])
        .range([0, width]);
    
    // Scale for the binding count (y-axis)
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(bindingPositions, d => d.count) * 1.1 || 1])
        .range([height, 0]);
    
    // X-axis
    const xAxis = d3.axisBottom(xScale)
        .tickValues(d3.range(0, sequenceLength, Math.ceil(sequenceLength / 10)))
        .tickFormat(d => d);
        
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);
    
    // Y-axis
    const yAxis = d3.axisLeft(yScale)
        .ticks(5);
        
    svg.append('g')
        .call(yAxis);
    
    // X-axis label
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .text('Amino Acid Position');
        
    // Y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -margin.left + 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .text('Binding Count');
    
    // Tooltip for bars
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Create the histogram bars
    svg.selectAll('.histogram-bar')
        .data(bindingPositions)
        .enter()
        .append('rect')
        .attr('class', 'histogram-bar')
        .attr('x', d => xScale(d.position))
        .attr('y', d => yScale(d.count))
        .attr('width', Math.max(1, width / sequenceLength))
        .attr('height', d => height - yScale(d.count))
        .attr('fill', '#9c27b0')  // Purple color for binding positions
        .on('mouseover', function(event, d) {
            d3.select(this)
                .attr('fill', '#673ab7');  // Darker shade on hover
                
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            tooltip.html(`
                <strong>Position: ${d.position}</strong><br/>
                Binding Count: ${d.count}
            `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .attr('fill', '#9c27b0');
                
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
        
    // Add event listener for the export button
    document.getElementById('export-binding-pos-png').addEventListener('click', function() {
        // Get sequence ID from the page to use in filename
        const sequenceId = document.querySelector('.sequence-title h3')?.textContent.trim() || 'sequence';
        const fileName = `${sequenceId}_binding_positions.png`;
        
        // Get the SVG element and export it
        const svgElement = document.getElementById('binding-histogram-svg');
        exportChartAsPng(svgElement, fileName, 'export-binding-pos-png');
    });
}

// Create binding distribution chart
function createBindingDistributionChart(bindingData) {
    const container = document.getElementById('binding-distribution');
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-binding-dist-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'binding-dist-svg-container';
    container.appendChild(svgContainer);
    
    // Set up dimensions
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;
    
    // Count bind levels with extra string safety
    const bindLevelCounts = {};
    bindingData.forEach(binding => {
        // Make sure we have a string binding level
        let bindLevel = binding.mimic_BindLevel;
        if (bindLevel === undefined || bindLevel === null) {
            bindLevel = 'Unknown';
        } else if (typeof bindLevel !== 'string') {
            // Convert to string for consistent processing
            bindLevel = String(bindLevel);
        }
        
        // Ensure we have a count for this level
        if (!bindLevelCounts[bindLevel]) {
            bindLevelCounts[bindLevel] = 0;
        }
        bindLevelCounts[bindLevel]++;
    });
    
    // Convert to array for D3
    const chartData = Object.entries(bindLevelCounts)
        .map(([level, count]) => ({ level, count }))
        .sort((a, b) => {
            // Custom sort order: SB, WB, then others
            const aLevel = a.level.toString();
            const bLevel = b.level.toString();
            
            if (aLevel.includes('SB')) return -1;
            if (bLevel.includes('SB')) return 1;
            if (aLevel.includes('WB')) return -1;
            if (bLevel.includes('WB')) return 1;
            
            // Try numeric comparison for numeric values
            const aNum = parseFloat(aLevel);
            const bNum = parseFloat(bLevel);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            
            // Fall back to string comparison
            return aLevel.localeCompare(bLevel);
        });
    
    // Create SVG
    const svg = d3.select('#binding-dist-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'binding-distribution-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(chartData.map(d => d.level))
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
    
    // Tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Add bars with specific colors
    svg.selectAll('bars')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.level))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', d => {
            const level = d.level.toString();
            
            // Check for strong binder
            if (level.includes('SB')) return '#28a745';  // Strong binder (green)
            
            // Check for weak binder
            if (level.includes('WB')) return '#ffc107';  // Weak binder (yellow)
            
            // Check numeric values for binding affinity thresholds
            const numVal = parseFloat(level);
            if (!isNaN(numVal)) {
                if (numVal <= 50) return '#28a745';  // <= 50nM is strong binder (green)
                if (numVal <= 500) return '#ffc107'; // <= 500nM is weak binder (yellow)
            }
            
            // Default for non-binder or others
            return '#dc3545';  // Non binder or others (red)
        })
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            tooltip.html(`
                <strong>${d.level}</strong><br/>
                Count: ${d.count}
            `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    
    // Add count labels
    svg.selectAll('.count-label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'count-label')
        .attr('x', d => x(d.level) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
        
    // Add event listener for the export button
    document.getElementById('export-binding-dist-png').addEventListener('click', function() {
        // Get sequence ID from the page to use in filename
        const sequenceId = document.querySelector('.sequence-title h3')?.textContent.trim() || 'sequence';
        const fileName = `${sequenceId}_binding_distribution.png`;
        
        // Get the SVG element and export it
        const svgElement = document.getElementById('binding-distribution-svg');
        exportChartAsPng(svgElement, fileName, 'export-binding-dist-png');
    });
}

// Initialize binding data filters and visualizations
function initBindingDataFilters(bindingData) {
    // Find all elements we need
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    const filtersContainer = document.getElementById('binding-filters');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const mhcFilter = document.getElementById('mhc-filter');
    const bindLevelFilter = document.getElementById('bind-level-filter');
    const affinityFilter = document.getElementById('affinity-filter');
    const peptideLengthFilter = document.getElementById('peptide-length-filter');
    const positionStartFilter = document.getElementById('position-start-filter');
    const positionEndFilter = document.getElementById('position-end-filter');
    const filterCount = document.getElementById('filter-count');
    const bindingRows = document.querySelectorAll('.binding-row');
    const exportCsvBtn = document.getElementById('export-binding-csv');
    
    // ====== Populate filter options ======
    
    // Get unique MHC values
    const mhcValues = new Set();
    // Get unique peptide lengths
    const peptideLengths = new Set();
    
    // Populate from data
    bindingData.forEach(binding => {
        if (binding.MHC) {
            mhcValues.add(binding.MHC);
        }
        if (binding.mimic_Peptide) {
            peptideLengths.add(binding.mimic_Peptide.length);
        }
    });
    
    // Add MHC options
    const sortedMHCs = Array.from(mhcValues).sort();
    sortedMHCs.forEach(mhc => {
        const option = document.createElement('option');
        option.value = mhc;
        option.textContent = mhc;
        mhcFilter.appendChild(option);
    });
    
    // Add peptide length options
    const sortedLengths = Array.from(peptideLengths).sort((a, b) => a - b);
    sortedLengths.forEach(length => {
        const option = document.createElement('option');
        option.value = length;
        option.textContent = length;
        peptideLengthFilter.appendChild(option);
    });
    
    // Initialize filter count
    updateFilterCount();
    
    // ====== Create MHC Distribution Chart ======
    createMhcDistributionChart(bindingData);
    
    // ====== Create Peptide Length Distribution Chart ======
    createPeptideLengthChart(bindingData);
    
    // ====== Set up event listeners ======
    
    // Toggle filters visibility
    toggleFiltersBtn.addEventListener('click', () => {
        if (filtersContainer.style.display === 'none') {
            filtersContainer.style.display = 'block';
            toggleFiltersBtn.innerHTML = '<i class="bi bi-funnel-fill"></i> Filters';
            toggleFiltersBtn.classList.remove('btn-outline-primary');
            toggleFiltersBtn.classList.add('btn-primary');
        } else {
            filtersContainer.style.display = 'none';
            toggleFiltersBtn.innerHTML = '<i class="bi bi-funnel"></i> Filters';
            toggleFiltersBtn.classList.remove('btn-primary');
            toggleFiltersBtn.classList.add('btn-outline-primary');
        }
    });
    
    // Reset filters
    resetFiltersBtn.addEventListener('click', () => {
        mhcFilter.value = '';
        bindLevelFilter.value = '';
        affinityFilter.value = '';
        peptideLengthFilter.value = '';
        positionStartFilter.value = '';
        positionEndFilter.value = '';
        
        // Show all rows
        bindingRows.forEach(row => {
            row.style.display = '';
        });
        
        updateFilterCount();
        
        // Update charts with all data
        createMhcDistributionChart(bindingData);
        createPeptideLengthChart(bindingData);
    });
    
    // Apply filters when any filter changes
    [mhcFilter, bindLevelFilter, affinityFilter, peptideLengthFilter, positionStartFilter, positionEndFilter].forEach(filter => {
        filter.addEventListener('change', applyFilters);
    });
    
    // Special case for inputs, not selects
    affinityFilter.addEventListener('input', applyFilters);
    positionStartFilter.addEventListener('input', applyFilters);
    positionEndFilter.addEventListener('input', applyFilters);
    
    // Export to CSV
    exportCsvBtn.addEventListener('click', () => exportBindingDataToCsv(bindingData));
    
    // ====== Filter functions ======
    
    function applyFilters() {
        const selectedMhc = mhcFilter.value;
        const selectedBindLevel = bindLevelFilter.value;
        const maxAffinity = affinityFilter.value ? parseFloat(affinityFilter.value) : null;
        const selectedLength = peptideLengthFilter.value ? parseInt(peptideLengthFilter.value) : null;
        const minPosition = positionStartFilter.value ? parseInt(positionStartFilter.value) : null;
        const maxPosition = positionEndFilter.value ? parseInt(positionEndFilter.value) : null;
        
        // Filter visible rows
        let visibleData = [];
        
        bindingRows.forEach(row => {
            const rowMhc = row.dataset.mhc;
            const rowBindLevel = row.dataset.bindLevel;
            const rowAffinity = parseFloat(row.dataset.affinity);
            const rowPeptideLength = parseInt(row.dataset.peptideLength);
            const rowStartPosition = parseInt(row.dataset.positionStart);
            const rowEndPosition = parseInt(row.dataset.positionEnd);
            
            // Check each filter condition
            let showRow = true;
            
            if (selectedMhc && rowMhc !== selectedMhc) {
                showRow = false;
            }
            
            if (selectedBindLevel && !rowBindLevel.includes(selectedBindLevel)) {
                showRow = false;
            }
            
            if (maxAffinity && !isNaN(rowAffinity) && rowAffinity > maxAffinity) {
                showRow = false;
            }
            
            if (selectedLength && rowPeptideLength !== selectedLength) {
                showRow = false;
            }
            
            // Position filters - only apply if both the filter is set and the row has valid position data
            if (minPosition !== null && rowStartPosition !== -1) {
                if (rowStartPosition < minPosition) {
                    showRow = false;
                }
            }
            
            if (maxPosition !== null && rowEndPosition !== -1) {
                if (rowEndPosition > maxPosition) {
                    showRow = false;
                }
            }
            
            // Show or hide the row
            row.style.display = showRow ? '' : 'none';
            
            // Add to visible data if shown
            if (showRow) {
                // Find the corresponding entry in the original data
                const originalDataEntry = bindingData.find(
                    binding => binding.MHC === rowMhc && 
                              binding.mimic_Peptide === row.dataset.peptide
                );
                
                if (originalDataEntry) {
                    visibleData.push(originalDataEntry);
                }
            }
        });
        
        // Update filter count and charts
        updateFilterCount();
        createMhcDistributionChart(visibleData);
        createPeptideLengthChart(visibleData);
    }
    
    function updateFilterCount() {
        // Count visible rows
        let visibleCount = 0;
        bindingRows.forEach(row => {
            if (row.style.display !== 'none') {
                visibleCount++;
            }
        });
        
        // Update badge text
        filterCount.textContent = `${visibleCount} matches`;
    }
}

// Create MHC distribution chart
function createMhcDistributionChart(data) {
    const container = document.getElementById('mhc-distribution-chart');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-mhc-dist-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'mhc-dist-svg-container';
    container.appendChild(svgContainer);
    
    if (!data || data.length === 0) {
        svgContainer.innerHTML = '<div class="alert alert-light">No data available</div>';
        return;
    }
    
    // Count MHC occurrences
    const mhcCounts = {};
    data.forEach(item => {
        const mhc = item.MHC || 'Unknown';
        mhcCounts[mhc] = (mhcCounts[mhc] || 0) + 1;
    });
    
    // Convert to array for D3
    const chartData = Object.entries(mhcCounts)
        .map(([mhc, count]) => ({ mhc, count }))
        .sort((a, b) => b.count - a.count); // Sort by count descending
    
    // Take top 10 to avoid overcrowding
    const topData = chartData.slice(0, 10);
    
    // Set up dimensions
    const margin = { top: 10, right: 10, bottom: 60, left: 50 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select('#mhc-dist-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'mhc-distribution-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(topData.map(d => d.mhc))
        .padding(0.2);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end')
        .attr('font-size', '10px');
    
    // Y axis
    const y = d3.scaleLinear()
        .domain([0, d3.max(topData, d => d.count) * 1.1])
        .range([height, 0]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Add bars
    svg.selectAll('bars')
        .data(topData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.mhc))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', '#5470c6')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            tooltip.html(`
                <strong>${d.mhc}</strong><br/>
                Count: ${d.count}
            `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    
    // Add count labels
    svg.selectAll('.count-label')
        .data(topData)
        .enter()
        .append('text')
        .attr('class', 'count-label')
        .attr('x', d => x(d.mhc) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .text(d => d.count);
        
    // Add event listener for the export button
    document.getElementById('export-mhc-dist-png').addEventListener('click', function() {
        // Get sequence ID from the page to use in filename
        const sequenceId = document.querySelector('.sequence-title h3')?.textContent.trim() || 'sequence';
        const fileName = `${sequenceId}_mhc_distribution.png`;
        
        // Get the SVG element and export it
        const svgElement = document.getElementById('mhc-distribution-svg');
        exportChartAsPng(svgElement, fileName, 'export-mhc-dist-png');
    });
}

// Create peptide length distribution chart
function createPeptideLengthChart(data) {
    const container = document.getElementById('peptide-length-chart');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-peptide-length-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'peptide-length-svg-container';
    container.appendChild(svgContainer);
    
    if (!data || data.length === 0) {
        svgContainer.innerHTML = '<div class="alert alert-light">No data available</div>';
        return;
    }
    
    // Count peptide lengths
    const lengthCounts = {};
    data.forEach(item => {
        if (item.mimic_Peptide) {
            const length = item.mimic_Peptide.length;
            lengthCounts[length] = (lengthCounts[length] || 0) + 1;
        }
    });
    
    // Convert to array for D3
    const chartData = Object.entries(lengthCounts)
        .map(([length, count]) => ({ length: parseInt(length), count }))
        .sort((a, b) => a.length - b.length); // Sort by length ascending
    
    // Set up dimensions
    const margin = { top: 10, right: 10, bottom: 30, left: 50 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select('#peptide-length-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'peptide-length-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(chartData.map(d => d.length))
        .padding(0.2);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('font-size', '10px');
    
    // Y axis
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.count) * 1.1])
        .range([height, 0]);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Add bars
    svg.selectAll('bars')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.length))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', '#91cc75')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            tooltip.html(`
                <strong>Length: ${d.length}</strong><br/>
                Count: ${d.count}
            `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    
    // Add count labels
    svg.selectAll('.count-label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'count-label')
        .attr('x', d => x(d.length) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .text(d => d.count);
        
    // Add event listener for the export button
    document.getElementById('export-peptide-length-png').addEventListener('click', function() {
        // Get sequence ID from the page to use in filename
        const sequenceId = document.querySelector('.sequence-title h3')?.textContent.trim() || 'sequence';
        const fileName = `${sequenceId}_peptide_length.png`;
        
        // Get the SVG element and export it
        const svgElement = document.getElementById('peptide-length-svg');
        exportChartAsPng(svgElement, fileName, 'export-peptide-length-png');
    });
}

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

// Export binding data to CSV
function exportBindingDataToCsv(data) {
    // Get all visible rows
    const visibleRows = Array.from(document.querySelectorAll('.binding-row'))
        .filter(row => row.style.display !== 'none');
    
    // Find the corresponding data entries
    const visibleData = visibleRows.map(row => {
        const mhc = row.dataset.mhc;
        const peptide = row.dataset.peptide;
        return data.find(item => item.MHC === mhc && item.mimic_Peptide === peptide);
    }).filter(Boolean); // Remove undefined entries
    
    // Define CSV columns
    const columns = [
        'MHC',
        'mimic_Peptide',
        'position_start',
        'position_end',
        'mimic_Score_EL',
        'mimic_%Rank_EL',
        'mimic_Aff(nM)',
        'mimic_BindLevel'
    ];
    
    // Create CSV header
    let csv = columns.join(',') + '\n';
    
    // Add each row
    visibleData.forEach(row => {
        const values = columns.map(col => {
            let value = row[col] !== undefined ? row[col] : '';
            
            // If value contains a comma, wrap in quotes
            if (String(value).includes(',')) {
                value = `"${value}"`;
            }
            
            return value;
        });
        
        csv += values.join(',') + '\n';
    });
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'binding_data.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Provide feedback by updating button
    const exportBtn = document.getElementById('export-binding-csv');
    exportBtn.innerHTML = '<i class="bi bi-check"></i> Downloaded';
    exportBtn.classList.remove('btn-outline-success');
    exportBtn.classList.add('btn-success');
    
    // Reset button after 2 seconds
    setTimeout(() => {
        exportBtn.innerHTML = '<i class="bi bi-download"></i> Export CSV';
        exportBtn.classList.remove('btn-success');
        exportBtn.classList.add('btn-outline-success');
    }, 2000);
}