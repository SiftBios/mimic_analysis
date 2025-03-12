// File: static/js/cancer_detail.js
// JavaScript for the cancer detail page visualizations

// Mapping of known HLA supertype colors
const hlaSuperTypeColors = {
    "A01": "#4e79a7",
    "A02": "#f28e2c",
    "A03": "#e15759",
    "A24": "#76b7b2",
    "B07": "#59a14f",
    "B08": "#edc949",
    "B27": "#af7aa1",
    "B44": "#ff9da7",
    "B58": "#9c755f",
    "B62": "#bab0ab"
};

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

// Initialize the cancer detail page
function initCancerDetail(data) {
    // Extract data
    const { 
        cancerAcc, 
        pfamDomains, 
        kofamDomains, 
        pfamEnrichment, 
        mhcAlleles, 
        mhcAlleleData, // New parameter with MHC frequencies
        bindingData, 
        affinityStats, 
        bindingLevels,
        defaultThresholds
    } = data;
    
    // DEBUG: Log key data for debugging
    console.log("DEBUG: Cancer detail initialization");
    console.log("DEBUG: Cancer acc:", cancerAcc);
    console.log("DEBUG: pfamDomains:", pfamDomains ? `${pfamDomains.length} items` : "undefined");
    console.log("DEBUG: pfamEnrichment:", pfamEnrichment ? `${pfamEnrichment.length} items` : "undefined");
    console.log("DEBUG: mhcAlleles:", mhcAlleles ? `${mhcAlleles.length} items` : "undefined");
    console.log("DEBUG: mhcAlleleData:", mhcAlleleData ? `${mhcAlleleData.length} items` : "undefined");
    console.log("DEBUG: bindingData:", bindingData ? `${bindingData.length} items` : "undefined");
    
    if (mhcAlleleData && mhcAlleleData.length > 0) {
        console.log("DEBUG: MHC allele counts:", mhcAlleleData.map(d => `${d.mhc}: ${d.count}`).join(', '));
    }
    
    if (pfamEnrichment && pfamEnrichment.length > 0) {
        console.log("DEBUG: First pfamEnrichment item:", pfamEnrichment[0]);
    } else {
        console.log("DEBUG: pfamEnrichment is empty or undefined");
    }
    
    // Store the original data for filtering
    window.cancerData = {
        pfamDomains: pfamDomains,
        kofamDomains: kofamDomains,
        pfamEnrichment: pfamEnrichment,
        bindingData: bindingData,
        mhcAlleles: mhcAlleles,
        mhcAlleleData: mhcAlleleData, // Store MHC frequency data
        thresholds: defaultThresholds
    };
    
    // Initialize visualizations
    createPfamEnrichmentChart(pfamEnrichment);
    createDomainDistributions(pfamDomains, kofamDomains);
    createBindingDistributionChart(bindingLevels, bindingData);
    createMHCDistributionChart(mhcAlleleData); // Use mhcAlleleData instead of separate parameters
    populateDomainTables(pfamDomains, kofamDomains);
    
    // Initialize threshold controls
    initThresholdControls();
}

// Create PFAM domain enrichment chart
function createPfamEnrichmentChart(pfamEnrichment) {
    console.log("DEBUG: Creating PFAM enrichment chart");
    
    const container = document.getElementById('pfam-enrichment-chart');
    if (!container) {
        console.log("DEBUG: pfam-enrichment-chart container not found");
        return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    // Add export button to the container
    const exportButtonContainer = document.createElement('div');
    exportButtonContainer.className = 'text-end mb-2';
    exportButtonContainer.innerHTML = `
        <button id="export-enrichment-png" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-download"></i> Export as PNG
        </button>
    `;
    container.appendChild(exportButtonContainer);
    
    // Create a wrapper for the SVG to allow exporting
    const svgContainer = document.createElement('div');
    svgContainer.id = 'pfam-enrichment-svg-container';
    container.appendChild(svgContainer);
    
    console.log("DEBUG: pfamEnrichment data:", pfamEnrichment);
    console.log("DEBUG: pfamEnrichment type:", typeof pfamEnrichment);
    if (pfamEnrichment) {
        console.log("DEBUG: pfamEnrichment length:", pfamEnrichment.length);
        if (pfamEnrichment.length > 0) {
            console.log("DEBUG: First enrichment item:", pfamEnrichment[0]);
        }
    }
    
    if (!pfamEnrichment || pfamEnrichment.length === 0) {
        console.log("DEBUG: No enrichment data available");
        svgContainer.innerHTML = `
            <div class="alert alert-warning">
                <p><strong>No domain enrichment data available.</strong></p>
                <p>This could happen if:</p>
                <ul>
                    <li>There are no domains in this cancer's proteins</li>
                    <li>The domains in this cancer don't appear in the global database</li>
                    <li>The current filter settings are excluding relevant domains</li>
                </ul>
                <p>Try adjusting your filter thresholds or check the server logs for more information.</p>
            </div>`;
        return;
    }
    
    // Update count badge
    const countBadge = document.getElementById('pfam-enrichment-count');
    if (countBadge) {
        countBadge.textContent = `${pfamEnrichment.length} domains`;
    }
    
    // Limit to top 15 enriched domains for better visualization
    const topDomains = pfamEnrichment
        .sort((a, b) => b.enrichment - a.enrichment) // Sort by enrichment (highest first)
        .slice(0, 15);
    
    // Set up dimensions
    const margin = { top: 20, right: 120, bottom: 120, left: 200 };
    const width = Math.max(300, container.clientWidth - margin.left - margin.right);
    const height = Math.min(450, Math.max(300, topDomains.length * 30)); // Height depends on number of domains but capped
    
    // Create SVG
    const svg = d3.select('#pfam-enrichment-svg-container')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('id', 'pfam-enrichment-svg')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis (log scale for enrichment score)
    const x = d3.scaleLog()
        .domain([0.1, Math.max(10, d3.max(topDomains, d => d.enrichment) * 1.1)])
        .range([0, width]);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5, ',.1f'))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');
    
    // X axis label
    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('x', width / 2)
        .attr('y', height + 60)
        .text('Fold Enrichment (log scale)');
    
    // Y axis
    const y = d3.scaleBand()
        .range([0, height])
        .domain(topDomains.map(d => d.domain))
        .padding(0.3);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Create tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Add reference line at 1.0 (equal enrichment)
    svg.append('line')
        .attr('x1', x(1))
        .attr('x2', x(1))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#666')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5');
    
    // Add bars for enrichment
    svg.selectAll('bars')
        .data(topDomains)
        .enter()
        .append('rect')
        .attr('class', 'domain-bar')
        .attr('y', d => y(d.domain))
        .attr('height', y.bandwidth())
        .attr('x', d => d.enrichment >= 1 ? x(1) : x(d.enrichment))
        .attr('width', d => {
            if (d.enrichment >= 1) {
                return x(d.enrichment) - x(1);
            } else {
                return x(1) - x(d.enrichment);
            }
        })
        .attr('fill', d => d.enrichment >= 1 ? '#5470c6' : '#e15759') // Blue for enriched, red for depleted
        .on('mouseover', function(event, d) {
            // Highlight the bar
            d3.select(this).attr('opacity', 0.8);
            
            // Show tooltip
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            tooltip.html(`
                <strong>${d.domain}</strong><br/>
                Fold Enrichment: ${d.enrichment.toFixed(2)}x<br/>
                Cancer Count: ${d.cancer_count} (${(d.cancer_fraction * 100).toFixed(1)}%)<br/>
                Global Count: ${d.global_count} (${(d.global_fraction * 100).toFixed(1)}%)<br/>
                <small>Click for details</small>
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            // Restore bar appearance
            d3.select(this).attr('opacity', 1);
            
            // Hide tooltip
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        })
        .on('click', function(event, d) {
            // Show domain-gene associations using the existing function
            showDomainAssociations({
                domain: d.domain,
                count: d.cancer_count,
                genes: d.genes,
                bitscores: d.bitscores,
                e_values: d.e_values
            }, 'pfam');
        });
    
    // Add enrichment value labels
    svg.selectAll('.label')
        .data(topDomains)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('y', d => y(d.domain) + y.bandwidth() / 2 + 4)
        .attr('x', d => d.enrichment >= 1 ? x(d.enrichment) + 5 : x(d.enrichment) - 5)
        .attr('text-anchor', d => d.enrichment >= 1 ? 'start' : 'end')
        .text(d => d.enrichment.toFixed(1) + 'x')
        .attr('font-size', '12px')
        .attr('fill', '#333');
    
    // Add chart title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text('PFAM Domain Enrichment');
    
    // Add event listener for the export button
    document.getElementById('export-enrichment-png').addEventListener('click', function() {
        const fileName = 'pfam_domain_enrichment.png';
        const svgElement = document.getElementById('pfam-enrichment-svg');
        exportChartAsPng(svgElement, fileName, 'export-enrichment-png');
    });
}

// Create domain distribution charts
function createDomainDistributions(pfamDomains, kofamDomains) {
    // Filter out META_ domains for counting
    const nonMetaPfamDomains = pfamDomains.filter(domain => !domain.domain.startsWith('META_'));
    const nonMetaKofamDomains = kofamDomains.filter(domain => !domain.domain.startsWith('META_'));
    
    // Create PFAM domain chart
    createDomainChart('pfam-domains-chart', pfamDomains, 'pfam');
    
    // Create KOFAM domain chart
    createDomainChart('kofam-domains-chart', kofamDomains, 'kofam');
    
    // Update domain counts to show only non-metagenome domains
    document.getElementById('pfam-domains-count').textContent = `${nonMetaPfamDomains.length} domains`;
    document.getElementById('kofam-domains-count').textContent = `${nonMetaKofamDomains.length} domains`;
}

// Create a domain distribution chart
function createDomainChart(containerId, domainData, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    if (!domainData || domainData.length === 0) {
        container.innerHTML = `<div class="alert alert-light">No ${type.toUpperCase()} domains found.</div>`;
        return;
    }
    
    // Filter out domains with META_ prefix (from metagenome data)
    const filteredDomains = domainData.filter(domain => 
        !domain.domain.startsWith('META_')
    );
    
    console.log(`DEBUG: ${type} domains before filtering: ${domainData.length}, after filtering META_ entries: ${filteredDomains.length}`);
    
    if (filteredDomains.length === 0) {
        container.innerHTML = `<div class="alert alert-light">No ${type.toUpperCase()} domains found (after filtering metagenome entries).</div>`;
        return;
    }
    
    // Limit to top domains for better visualization
    const topDomains = filteredDomains.slice(0, 15);
    
    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 120, left: 150 };
    const width = Math.max(300, container.clientWidth - margin.left - margin.right);
    const height = Math.max(200, 400 - margin.top - margin.bottom);
    
    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleLinear()
        .domain([0, d3.max(topDomains, d => d.count)])
        .range([0, width]);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(0)')
        .style('text-anchor', 'end');
    
    // Y axis
    const y = d3.scaleBand()
        .range([0, height])
        .domain(topDomains.map(d => d.domain))
        .padding(0.3);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Create tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Add bars
    svg.selectAll('bars')
        .data(topDomains)
        .enter()
        .append('rect')
        .attr('class', `domain-bar ${type}`)
        .attr('y', d => y(d.domain))
        .attr('height', y.bandwidth())
        .attr('x', 0)
        .attr('width', d => x(d.count))
        .on('mouseover', function(event, d) {
            // Highlight the bar
            d3.select(this).attr('opacity', 0.8);
            
            // Show tooltip
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            // Calculate average bitscore and e-value
            const avgBitscore = d.bitscores.reduce((a, b) => a + b, 0) / d.bitscores.length;
            const avgEvalue = d.e_values.reduce((a, b) => a + b, 0) / d.e_values.length;
            
            tooltip.html(`
                <strong>${d.domain}</strong><br/>
                Count: ${d.count}<br/>
                Avg. BitScore: ${avgBitscore.toFixed(2)}<br/>
                Avg. E-value: ${avgEvalue.toExponential(2)}<br/>
                <small>Click for details</small>
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            // Restore bar appearance
            d3.select(this).attr('opacity', 1);
            
            // Hide tooltip
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        })
        .on('click', function(event, d) {
            // Show domain-gene associations
            showDomainAssociations(d, type);
        });
    
    // Add labels to bars
    svg.selectAll('.label')
        .data(topDomains)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('y', d => y(d.domain) + y.bandwidth() / 2 + 4)
        .attr('x', d => x(d.count) + 5)
        .text(d => d.count)
        .attr('font-size', '12px')
        .attr('fill', '#333');
        
    // Add chart title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text(`Top ${type.toUpperCase()} Domains`);
}

// Create binding distribution chart
function createBindingDistributionChart(bindingLevels, bindingData) {
    const container = document.getElementById('binding-distribution');
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    if (!bindingData || bindingData.length === 0) {
        container.innerHTML = '<div class="alert alert-light">No binding data available.</div>';
        return;
    }
    
    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 70, left: 60 };
    const width = Math.max(300, container.clientWidth - margin.left - margin.right);
    const height = Math.max(200, container.clientHeight - margin.top - margin.bottom || 200);
    
    // Create SVG
    const svg = d3.select('#binding-distribution')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Convert binding levels to array for visualization
    const chartData = Object.entries(bindingLevels).map(([level, count]) => ({
        level,
        count
    }));
    
    // Sort by custom order (SB, WB, others)
    chartData.sort((a, b) => {
        const aLevel = a.level.toString();
        const bLevel = b.level.toString();
        
        if (aLevel.includes('SB')) return -1;
        if (bLevel.includes('SB')) return 1;
        if (aLevel.includes('WB')) return -1;
        if (bLevel.includes('WB')) return 1;
        
        // Try numeric comparison
        const aNum = parseFloat(aLevel);
        const bNum = parseFloat(bLevel);
        if (!isNaN(aNum) && !isNaN(bNum)) {
            return aNum - bNum;
        }
        
        return aLevel.localeCompare(bLevel);
    });
    
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
    
    // Add binding threshold lines
    const sbThreshold = 50;  // 50nM for strong binders
    const wbThreshold = 500; // 500nM for weak binders
    
    // Convert thresholds to y-position if the data is affinity values
    const numericLevels = bindingData
        .filter(d => !isNaN(parseFloat(d.level)))
        .map(d => parseFloat(d.level));
    
    if (numericLevels.length > 0) {
        // Add threshold lines for numeric affinity values
        const yPos = numericLevels.reduce((acc, curr) => curr + acc, 0) / numericLevels.length;
        
        svg.append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', yPos)
            .attr('y2', yPos)
            .attr('stroke', 'red')
            .attr('stroke-dasharray', '3,3')
            .attr('stroke-width', 1);
    }
    
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
            
            d3.select(this)
                .attr('opacity', 0.8);
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
                
            d3.select(this)
                .attr('opacity', 1);
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
        .attr('font-size', '12px')
        .text(d => d.count);
    
    // Add chart title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text('Binding Level Distribution');
    
    // Add horizontal axis label
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Binding Level');
}

// Create MHC distribution chart
function createMHCDistributionChart(mhcAlleleData) {
    console.log("DEBUG: Creating MHC distribution chart");
    console.log(`DEBUG: mhcAlleleData: ${mhcAlleleData ? JSON.stringify(mhcAlleleData.slice(0, 3)) + '...' : 'undefined'}`);
    
    const container = document.getElementById('mhc-distribution-chart');
    if (!container) {
        console.log("DEBUG: mhc-distribution-chart container not found!");
        return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    if (!mhcAlleleData || mhcAlleleData.length === 0) {
        console.log("DEBUG: No MHC alleles available for chart");
        container.innerHTML = '<div class="alert alert-light">No MHC alleles available.</div>';
        return;
    }
    
    // Sort the data by count and limit to top 15
    const mhcData = [...mhcAlleleData]
        .sort((a, b) => b.count - a.count)
        .slice(0, 15); // Limit to top 15 for better visualization
        
    console.log(`DEBUG: Using ${mhcData.length} MHC alleles for chart with counts:`, 
                mhcData.map(d => `${d.mhc}: ${d.count}`).join(', '));
    
    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 70, left: 150 }; // Increased left margin for labels
    const width = Math.max(300, container.clientWidth - margin.left - margin.right);
    const height = Math.max(350, mhcData.length * 30); // Height based on number of alleles
    
    // Add a unique ID to ensure we don't have duplicate SVGs
    const svgId = 'mhc-distribution-svg-' + Date.now();
    
    // Remove any existing SVGs first
    d3.select('#mhc-distribution-chart svg').remove();
    
    // Create SVG with unique ID
    const svg = d3.select('#mhc-distribution-chart')
        .append('svg')
        .attr('id', svgId)
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis (horizontal) - now for counts
    const x = d3.scaleLinear()
        .domain([0, d3.max(mhcData, d => d.count) * 1.1])
        .range([0, width]);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x));
    
    // Y axis (vertical) - now for MHC alleles
    const y = d3.scaleBand()
        .domain(mhcData.map(d => d.mhc))
        .range([0, height])
        .padding(0.3);
    
    svg.append('g')
        .call(d3.axisLeft(y));
    
    // Function to determine color based on MHC allele
    function getMHCColor(mhc) {
        // Try to extract supertype from MHC string
        const match = mhc.match(/HLA-(A|B|C)\*(\d+)/i);
        if (match) {
            const locus = match[1];
            const alleleGroup = match[2];
            const supertype = `${locus}${alleleGroup.padStart(2, '0')}`;
            
            // Use predefined color if available
            if (hlaSuperTypeColors[supertype]) {
                return hlaSuperTypeColors[supertype];
            }
            
            // Fallback to locus-based coloring
            if (locus === 'A') return '#4e79a7';
            if (locus === 'B') return '#e15759';
            if (locus === 'C') return '#59a14f';
        }
        
        // Default color
        return '#76b7b2';
    }
    
    // Tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Add horizontal bars
    svg.selectAll('bars')
        .data(mhcData)
        .enter()
        .append('rect')
        .attr('class', 'domain-bar')
        .attr('y', d => y(d.mhc))
        .attr('height', y.bandwidth())
        .attr('x', 0)
        .attr('width', d => x(d.count))
        .attr('fill', d => getMHCColor(d.mhc))
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
            
            d3.select(this)
                .attr('opacity', 0.8);
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
                
            d3.select(this)
                .attr('opacity', 1);
        });
    
    // Add count labels
    svg.selectAll('.count-label')
        .data(mhcData)
        .enter()
        .append('text')
        .attr('class', 'count-label')
        .attr('y', d => y(d.mhc) + y.bandwidth() / 2 + 4)
        .attr('x', d => x(d.count) + 5)
        .attr('text-anchor', 'start')
        .attr('font-size', '12px')
        .text(d => d.count);
    
    // Add chart title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text('MHC Allele Distribution');
    
    // Add x-axis label
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 40)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Frequency');
    
    // Display information in the binding chart container
    const bindingContainer = document.getElementById('mhc-binding-chart');
    if (bindingContainer) {
        // We don't have binding data for this example, so show an informative message
        bindingContainer.innerHTML = `
            <div class="alert alert-info">
                <p><strong>Binding affinity data not available for these MHC alleles</strong></p>
                <p>These MHC alleles are associated with this cancer, but no specific binding affinity data is available.</p>
                <p>This can happen when the MHC alleles are known to bind to this cancer antigen, but the specific binding metrics 
                (such as affinity in nM) were not provided in the input data.</p>
            </div>`;
    }
}

// Create MHC binding affinity chart
function createMHCBindingChart(bindingData) {
    console.log("DEBUG: Creating MHC binding affinity chart");
    console.log(`DEBUG: bindingData length: ${bindingData ? bindingData.length : 'undefined'}`);
    
    const container = document.getElementById('mhc-binding-chart');
    if (!container) {
        console.log("DEBUG: mhc-binding-chart container not found!");
        return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    if (!bindingData || bindingData.length === 0) {
        console.log("DEBUG: No binding data available for binding affinity chart");
        container.innerHTML = '<div class="alert alert-light">No binding data available.</div>';
        return;
    }
    
    // Calculate median binding affinity per MHC
    const mhcBindingValues = {};
    
    bindingData.forEach(binding => {
        const mhc = binding.MHC;
        const affinity = binding['mimic_Aff(nM)'];
        
        if (mhc && affinity !== undefined && !isNaN(parseFloat(affinity))) {
            if (!mhcBindingValues[mhc]) {
                mhcBindingValues[mhc] = [];
            }
            mhcBindingValues[mhc].push(parseFloat(affinity));
        }
    });
    
    // Calculate median for each MHC
    const mhcMedians = Object.entries(mhcBindingValues).map(([mhc, values]) => {
        values.sort((a, b) => a - b);
        const median = values.length % 2 === 0 
            ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
            : values[Math.floor(values.length / 2)];
            
        return {
            mhc,
            median,
            count: values.length
        };
    });
    
    // Sort by median and limit to top 15
    mhcMedians.sort((a, b) => a.median - b.median);
    const top15 = mhcMedians.slice(0, 15);
    
    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 120, left: 60 };
    const width = Math.max(300, container.clientWidth - margin.left - margin.right);
    const height = Math.max(200, 400 - margin.top - margin.bottom);
    
    // Add a unique ID to ensure we don't have duplicate SVGs
    const svgId = 'mhc-binding-svg-' + Date.now();
    
    // Remove any existing SVGs first
    d3.select('#mhc-binding-chart svg').remove();
    
    // Create SVG with unique ID
    const svg = d3.select('#mhc-binding-chart')
        .append('svg')
        .attr('id', svgId)
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(top15.map(d => d.mhc))
        .padding(0.2);
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'translate(-10,10)rotate(-45)')
        .style('text-anchor', 'end');
    
    // Y axis (log scale for binding affinity)
    const y = d3.scaleLog()
        .domain([1, d3.max(top15, d => d.median) * 2])
        .range([height, 0]);
    
    svg.append('g')
        .call(d3.axisLeft(y).tickFormat(d => d));
    
    // Add threshold lines
    const sbThreshold = 50;  // 50nM for strong binders
    const wbThreshold = 500; // 500nM for weak binders
    
    svg.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(sbThreshold))
        .attr('y2', y(sbThreshold))
        .attr('stroke', '#28a745')
        .attr('stroke-dasharray', '3,3')
        .attr('stroke-width', 2);
        
    svg.append('text')
        .attr('x', 5)
        .attr('y', y(sbThreshold) - 5)
        .attr('fill', '#28a745')
        .attr('font-size', '12px')
        .text('SB Threshold (50nM)');
    
    svg.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(wbThreshold))
        .attr('y2', y(wbThreshold))
        .attr('stroke', '#ffc107')
        .attr('stroke-dasharray', '3,3')
        .attr('stroke-width', 2);
        
    svg.append('text')
        .attr('x', 5)
        .attr('y', y(wbThreshold) - 5)
        .attr('fill', '#ffc107')
        .attr('font-size', '12px')
        .text('WB Threshold (500nM)');
    
    // Tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'domain-tooltip')
        .style('opacity', 0);
    
    // Add bars
    svg.selectAll('bars')
        .data(top15)
        .enter()
        .append('rect')
        .attr('x', d => x(d.mhc))
        .attr('y', d => y(d.median))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.median))
        .attr('fill', d => {
            // Color based on affinity
            if (d.median <= sbThreshold) return '#28a745'; // Strong binder
            if (d.median <= wbThreshold) return '#ffc107'; // Weak binder
            return '#dc3545'; // Non-binder
        })
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            tooltip.html(`
                <strong>${d.mhc}</strong><br/>
                Median Affinity: ${d.median.toFixed(2)} nM<br/>
                Binding Count: ${d.count}
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
            
            d3.select(this)
                .attr('opacity', 0.8);
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
                
            d3.select(this)
                .attr('opacity', 1);
        });
    
    // Add median value labels
    svg.selectAll('.median-label')
        .data(top15)
        .enter()
        .append('text')
        .attr('class', 'median-label')
        .attr('x', d => x(d.mhc) + x.bandwidth() / 2)
        .attr('y', d => y(d.median) - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .text(d => d.median.toFixed(1));
    
    // Add chart title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text('Median Binding Affinity by MHC Allele');
    
    // Add horizontal axis label
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('MHC Allele');
        
    // Add vertical axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -margin.left + 15)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Binding Affinity (nM)');
}

// Populate domain tables
function populateDomainTables(pfamDomains, kofamDomains) {
    // Populate PFAM domains table
    populateDomainTable('pfam-details-table', pfamDomains, 'pfam');
    
    // Populate KOFAM domains table
    populateDomainTable('kofam-details-table', kofamDomains, 'kofam');
}

// Populate a domain table
function populateDomainTable(tableId, domainData, type) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    // Get the table body
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (!domainData || domainData.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5" class="text-center">No ${type.toUpperCase()} domains found.</td>`;
        tbody.appendChild(row);
        return;
    }
    
    // Filter out domains with META_ prefix (from metagenome data)
    const filteredDomains = domainData.filter(domain => 
        !domain.domain.startsWith('META_')
    );
    
    console.log(`DEBUG: ${type} domain table before filtering: ${domainData.length}, after filtering META_ entries: ${filteredDomains.length}`);
    
    if (filteredDomains.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5" class="text-center">No ${type.toUpperCase()} domains found (after filtering metagenome entries).</td>`;
        tbody.appendChild(row);
        return;
    }
    
    // Create rows for each domain
    filteredDomains.forEach(domain => {
        // Skip domains with META_ prefix
        if (domain.domain.startsWith('META_')) {
            return;
        }
        
        const row = document.createElement('tr');
        
        // Calculate average stats
        const avgBitscore = domain.bitscores.reduce((a, b) => a + b, 0) / domain.bitscores.length;
        const avgEvalue = domain.e_values.reduce((a, b) => a + b, 0) / domain.e_values.length;
        
        row.innerHTML = `
            <td>${domain.domain}</td>
            <td>${domain.count}</td>
            <td>${avgBitscore.toFixed(2)}</td>
            <td>${avgEvalue.toExponential(2)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-domain-btn" 
                        data-domain='${JSON.stringify({ 
                            domain: domain.domain, 
                            type: type, 
                            count: domain.count,
                            genes: domain.genes 
                        }).replace(/'/g, "&apos;")}'>
                    <i class="bi bi-search"></i> View
                </button>
                ${type === 'pfam' ? 
                    `<a href="http://pfam.xfam.org/family/${domain.domain}" target="_blank" class="btn btn-sm btn-outline-info ms-1">
                        <i class="bi bi-box-arrow-up-right"></i> Pfam
                    </a>` :
                    `<a href="https://www.genome.jp/dbget-bin/www_bget?ko:${domain.domain}" target="_blank" class="btn btn-sm btn-outline-info ms-1">
                        <i class="bi bi-box-arrow-up-right"></i> KEGG
                    </a>`
                }
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Add event listeners to view buttons
    tbody.querySelectorAll('.view-domain-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const domainData = JSON.parse(this.dataset.domain);
            showDomainAssociations(domainData, domainData.type);
        });
    });
}

// Show domain-gene associations
function showDomainAssociations(domain, type) {
    const card = document.getElementById('domain-associations-card');
    const title = document.getElementById('domain-associations-title');
    const content = document.getElementById('domain-associations-content');
    
    if (!card || !title || !content) return;
    
    // Update title
    title.innerHTML = `<i class="bi bi-diagram-3"></i> ${domain.domain} Domain Associations`;
    
    // Prepare content
    let html = `
        <div class="alert alert-info">
            <i class="bi bi-info-circle"></i>
            ${type.toUpperCase()} domain <strong>${domain.domain}</strong> is found in ${domain.genes.length} mimic genes.
        </div>
        
        <div class="row">
            <div class="col-md-6">
                <h6>Associated Mimic Genes</h6>
                <div class="domain-genes-list">
    `;
    
    // Add gene links
    domain.genes.forEach(gene => {
        html += `<a href="/sequence/${gene}" class="btn btn-sm btn-outline-secondary mimic-gene-link">${gene}</a>`;
    });
    
    html += `
                </div>
            </div>
            <div class="col-md-6">
                <h6>Domain Information</h6>
                <table class="table table-bordered">
                    <tbody>
                        <tr>
                            <th class="table-light">Domain Type</th>
                            <td>${type.toUpperCase()}</td>
                        </tr>
                        <tr>
                            <th class="table-light">Domain ID</th>
                            <td>${domain.domain}</td>
                        </tr>
                        <tr>
                            <th class="table-light">Occurrence Count</th>
                            <td>${domain.count}</td>
                        </tr>
                    </tbody>
                </table>
                <div class="mt-3">
                    ${type === 'pfam' ?
                        `<a href="http://pfam.xfam.org/family/${domain.domain}" target="_blank" class="btn btn-outline-info">
                            <i class="bi bi-box-arrow-up-right"></i> View in Pfam Database
                        </a>` :
                        `<a href="https://www.genome.jp/dbget-bin/www_bget?ko:${domain.domain}" target="_blank" class="btn btn-outline-info">
                            <i class="bi bi-box-arrow-up-right"></i> View in KEGG Database
                        </a>`
                    }
                </div>
            </div>
        </div>
    `;
    
    // Update content
    content.innerHTML = html;
    
    // Show the card
    card.style.display = 'block';
    
    // Scroll to the card
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Initialize threshold controls
function initThresholdControls() {
    const applyBtn = document.getElementById('apply-thresholds');
    if (!applyBtn) return;
    
    applyBtn.addEventListener('click', function() {
        // Get threshold values
        const bitscoreThreshold = parseFloat(document.getElementById('bitscore-threshold').value);
        const evalueThreshold = parseFloat(document.getElementById('evalue-threshold').value);
        const countThreshold = parseInt(document.getElementById('count-threshold').value);
        const bindingThreshold = parseFloat(document.getElementById('binding-threshold').value);
        
        // Store updated thresholds
        window.cancerData.thresholds = {
            bitscore: bitscoreThreshold,
            evalue: evalueThreshold,
            count: countThreshold,
            binding: bindingThreshold
        };
        
        // Apply filtering
        applyThresholds();
    });
}

// Apply thresholds to data
function applyThresholds() {
    const thresholds = window.cancerData.thresholds;
    
    // Filter PFAM domains
    const filteredPfam = window.cancerData.pfamDomains.filter(domain => {
        // Filter out META_ prefixed domains (metagenome)
        if (domain.domain.startsWith('META_')) return false;
        
        // Check count threshold
        if (domain.count < thresholds.count) return false;
        
        // Calculate average bitscore and check bitscore threshold
        const avgBitscore = domain.bitscores.reduce((a, b) => a + b, 0) / domain.bitscores.length;
        if (avgBitscore < thresholds.bitscore) return false;
        
        // Calculate average e-value and check e-value threshold
        const avgEvalue = domain.e_values.reduce((a, b) => a + b, 0) / domain.e_values.length;
        if (avgEvalue > thresholds.evalue) return false;
        
        return true;
    });
    
    // Filter KOFAM domains
    const filteredKofam = window.cancerData.kofamDomains.filter(domain => {
        // Filter out META_ prefixed domains (metagenome)
        if (domain.domain.startsWith('META_')) return false;
        
        // Check count threshold
        if (domain.count < thresholds.count) return false;
        
        // Calculate average bitscore and check bitscore threshold
        const avgBitscore = domain.bitscores.reduce((a, b) => a + b, 0) / domain.bitscores.length;
        if (avgBitscore < thresholds.bitscore) return false;
        
        // Calculate average e-value and check e-value threshold
        const avgEvalue = domain.e_values.reduce((a, b) => a + b, 0) / domain.e_values.length;
        if (avgEvalue > thresholds.evalue) return false;
        
        return true;
    });
    
    // Filter binding data based on binding threshold
    const filteredBindingData = window.cancerData.bindingData.filter(binding => {
        // Extract binding affinity
        const affinity = binding['mimic_Aff(nM)'];
        if (affinity === undefined || isNaN(parseFloat(affinity))) return true;
        
        // Compare with threshold
        return parseFloat(affinity) <= thresholds.binding;
    });
    
    // Update visualizations with filtered data
    updateVisualizations(filteredPfam, filteredKofam, filteredBindingData);
}

// Update visualizations with filtered data
function updateVisualizations(pfamDomains, kofamDomains, bindingData) {
    // Filter out META_ domains for counting
    const nonMetaPfamDomains = pfamDomains.filter(domain => !domain.domain.startsWith('META_'));
    const nonMetaKofamDomains = kofamDomains.filter(domain => !domain.domain.startsWith('META_'));
    
    // Update domain counts to show only non-metagenome domains
    document.getElementById('pfam-domains-count').textContent = `${nonMetaPfamDomains.length} domains`;
    document.getElementById('kofam-domains-count').textContent = `${nonMetaKofamDomains.length} domains`;
    
    // Filter the pfam enrichment data based on pfamDomains
    const filteredPfamEnrichment = [];
    if (window.cancerData && window.cancerData.pfamEnrichment && Array.isArray(window.cancerData.pfamEnrichment)) {
        console.log("DEBUG: Filtering pfamEnrichment data", window.cancerData.pfamEnrichment.length);
        const pfamDomainNames = pfamDomains.map(d => d.domain);
        window.cancerData.pfamEnrichment.forEach(enrichment => {
            if (enrichment && pfamDomainNames.includes(enrichment.domain)) {
                filteredPfamEnrichment.push(enrichment);
            }
        });
        console.log("DEBUG: After filtering, pfamEnrichment has", filteredPfamEnrichment.length, "items");
    } else {
        console.log("DEBUG: No pfamEnrichment data available for filtering");
    }
    
    // Update enrichment chart with filtered data
    createPfamEnrichmentChart(filteredPfamEnrichment);
    
    // Calculate binding levels for the filtered data
    const bindingLevels = {};
    filteredBindingData.forEach(binding => {
        // Get binding level with string safety
        let level = binding.mimic_BindLevel;
        if (level === undefined || level === null) {
            level = 'Unknown';
        } else if (typeof level !== 'string') {
            level = String(level);
        }
        
        // Count level occurrences
        if (!bindingLevels[level]) {
            bindingLevels[level] = 0;
        }
        bindingLevels[level]++;
    });
    
    // Calculate stats for the filtered binding data
    const affinityValues = [];
    filteredBindingData.forEach(binding => {
        const affinity = binding['mimic_Aff(nM)'];
        if (affinity !== undefined && !isNaN(parseFloat(affinity))) {
            affinityValues.push(parseFloat(affinity));
        }
    });
    
    // Sort for median calculation
    affinityValues.sort((a, b) => a - b);
    
    const affinityStats = affinityValues.length > 0 ? {
        min: Math.min(...affinityValues),
        max: Math.max(...affinityValues),
        mean: affinityValues.reduce((a, b) => a + b, 0) / affinityValues.length,
        median: affinityValues.length % 2 === 0 
            ? (affinityValues[affinityValues.length / 2 - 1] + affinityValues[affinityValues.length / 2]) / 2
            : affinityValues[Math.floor(affinityValues.length / 2)],
        count: affinityValues.length,
        data: affinityValues
    } : {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        count: 0,
        data: []
    };
    
    // Update domain distribution charts
    createDomainDistributions(pfamDomains, kofamDomains);
    
    // Update binding distribution chart
    createBindingDistributionChart(bindingLevels, filteredBindingData);
    
    // Update domain tables
    populateDomainTables(pfamDomains, kofamDomains);
    
    // Get MHC alleles - either from the original template data if available (preferred),
    // or extract from binding data as a fallback
    let mhcAlleles = window.cancerData.mhcAlleles || [];
    
    // If no stored MHC alleles from template and we have binding data, extract from binding data
    if ((!mhcAlleles || mhcAlleles.length === 0) && filteredBindingData.length > 0) {
        mhcAlleles = Array.from(new Set(filteredBindingData.map(binding => binding.MHC))).filter(Boolean);
    }
    
    console.log(`DEBUG: Using ${mhcAlleles.length} MHC alleles for visualization`);
    
    // Update MHC distribution chart
    createMHCDistributionChart(mhcAlleles, filteredBindingData);
    
    // Hide domain associations card if showing
    document.getElementById('domain-associations-card').style.display = 'none';
}