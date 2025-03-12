// File: static/js/filters.js
// Handle filter functionality for the data table

// Initialize filters based on column metadata
function initializeFilters(metadata) {
    const filterContainer = document.getElementById('filter-container');
    
    // Clear loading indicator and existing filters
    filterContainer.innerHTML = '';
    
    // Create filter groups for important columns
    const priorityColumns = [
        'MHC', 
        'mimic_BindLevel', 
        'mimic_%Rank_EL', 
        'mimic_Aff(nM)', 
        'origin_seq_length',
        'PFAM_domain_names',
        'KOFAM_domain_names',
        'PFAM_domain_count', 
        'KOFAM_domain_count'
    ];
    
    // First add priority columns
    priorityColumns.forEach(column => {
        if (metadata[column]) {
            addFilterGroup(filterContainer, column, metadata[column]);
        }
    });
    
    // Add search box for sequence ID
    if (metadata['mimic_gene']) {
        addFilterGroup(filterContainer, 'mimic_gene', metadata['mimic_gene']);
    }
    
    // Add search box for peptide
    if (metadata['mimic_Peptide']) {
        addFilterGroup(filterContainer, 'mimic_Peptide', metadata['mimic_Peptide']);
    }
    
    // Add filter for cancer accession
    if (metadata['cancer_acc']) {
        addFilterGroup(filterContainer, 'cancer_acc', metadata['cancer_acc']);
    }
}

// Add a filter group for a column
function addFilterGroup(container, column, columnData) {
    const group = document.createElement('div');
    group.className = 'filter-group';
    group.dataset.column = column;
    
    // Add label
    const label = document.createElement('div');
    label.className = 'filter-label';
    label.textContent = formatColumnName(column);
    group.appendChild(label);
    
    // Add filter control based on data type
    if (columnData.type === 'string') {
        addStringFilter(group, column, columnData);
    } else if (columnData.type === 'numeric') {
        addNumericFilter(group, column, columnData);
    } else if (columnData.type === 'boolean') {
        addBooleanFilter(group, column, columnData);
    }
    
    container.appendChild(group);
}

// Add a string filter (text input)
function addStringFilter(group, column, columnData) {
    const control = document.createElement('div');
    control.className = 'filter-control';
    
    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    
    // Special handling for domain filters
    if (column === 'PFAM_domain_names') {
        input.placeholder = 'Search PFAM domain...';
        const hint = document.createElement('div');
        hint.className = 'small text-muted mt-1';
        hint.innerHTML = 'Search for PFAM domains (e.g. PF00005, DnaJ)';
        control.appendChild(hint);
    } else if (column === 'KOFAM_domain_names') {
        input.placeholder = 'Search KOFAM domain...';
        const hint = document.createElement('div');
        hint.className = 'small text-muted mt-1';
        hint.innerHTML = 'Search for KOFAM domains (e.g. K07479, RpsA)';
        control.appendChild(hint);
    } else {
        input.placeholder = 'Search...';
    }
    
    input.dataset.column = column;
    
    // Set initial value if filter exists
    if (state.filters[column]) {
        input.value = state.filters[column];
    }
    
    control.appendChild(input);
    
    // Add example values if available and not a domain filter
    if (columnData.example_values && 
        columnData.example_values.length > 0 && 
        column !== 'PFAM_domain_names' && 
        column !== 'KOFAM_domain_names') {
        
        const examples = document.createElement('div');
        examples.className = 'small text-muted mt-1';
        
        // Format examples
        let exampleText = 'Examples: ';
        
        // If there are only a few unique values, show all of them
        if (columnData.unique_count <= 5) {
            exampleText += columnData.example_values.join(', ');
        } else {
            // Otherwise show a few examples
            exampleText += columnData.example_values.slice(0, 3).join(', ');
        }
        
        examples.textContent = exampleText;
        control.appendChild(examples);
    }
    
    group.appendChild(control);
}

// Add a numeric filter (min/max inputs)
function addNumericFilter(group, column, columnData) {
    const control = document.createElement('div');
    control.className = 'filter-control';
    
    // Create min/max inputs
    const inputGroup = document.createElement('div');
    inputGroup.className = 'numeric-filter-inputs';
    
    // Min input
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.className = 'form-control';
    minInput.placeholder = 'Min';
    minInput.dataset.column = column;
    minInput.dataset.filterType = 'min';
    
    // Set step attribute for decimal numbers
    if (columnData.min !== null && columnData.min % 1 !== 0) {
        minInput.step = '0.01';
    }
    
    // Set initial value if filter exists
    if (state.filters[column] && state.filters[column].min !== undefined) {
        minInput.value = state.filters[column].min;
    }
    
    // Max input
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.className = 'form-control';
    maxInput.placeholder = 'Max';
    maxInput.dataset.column = column;
    maxInput.dataset.filterType = 'max';
    
    // Set step attribute for decimal numbers
    if (columnData.max !== null && columnData.max % 1 !== 0) {
        maxInput.step = '0.01';
    }
    
    // Set initial value if filter exists
    if (state.filters[column] && state.filters[column].max !== undefined) {
        maxInput.value = state.filters[column].max;
    }
    
    inputGroup.appendChild(minInput);
    inputGroup.appendChild(maxInput);
    control.appendChild(inputGroup);
    
    // Add range information if available
    if (columnData.min !== null && columnData.max !== null) {
        const rangeInfo = document.createElement('div');
        rangeInfo.className = 'small text-muted mt-1';
        rangeInfo.textContent = `Range: ${formatNumber(columnData.min)} - ${formatNumber(columnData.max)}`;
        control.appendChild(rangeInfo);
    }
    
    group.appendChild(control);
}

// Add a boolean filter (checkbox)
function addBooleanFilter(group, column, columnData) {
    const control = document.createElement('div');
    control.className = 'filter-control';
    
    // Create checkbox
    const checkbox = document.createElement('div');
    checkbox.className = 'form-check';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'form-check-input';
    input.id = `filter-${column}`;
    input.dataset.column = column;
    
    // Set initial value if filter exists
    if (state.filters[column] !== undefined) {
        input.checked = state.filters[column];
    }
    
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = `filter-${column}`;
    label.textContent = 'True';
    
    checkbox.appendChild(input);
    checkbox.appendChild(label);
    control.appendChild(checkbox);
    
    // Add counts
    const countsInfo = document.createElement('div');
    countsInfo.className = 'small text-muted mt-1';
    countsInfo.textContent = `True: ${columnData.true_count}, False: ${columnData.false_count}`;
    control.appendChild(countsInfo);
    
    group.appendChild(control);
}

// Update the filters state from UI inputs
function updateFiltersFromUI() {
    // Reset filters
    state.filters = {};
    
    // Get all filter inputs
    const filterGroups = document.querySelectorAll('.filter-group');
    
    filterGroups.forEach(group => {
        const column = group.dataset.column;
        
        // String filters (text inputs)
        const textInput = group.querySelector('input[type="text"]');
        if (textInput && textInput.value.trim() !== '') {
            state.filters[column] = textInput.value.trim();
        }
        
        // Numeric filters (min/max inputs)
        const minInput = group.querySelector('input[data-filter-type="min"]');
        const maxInput = group.querySelector('input[data-filter-type="max"]');
        
        if ((minInput && minInput.value !== '') || (maxInput && maxInput.value !== '')) {
            state.filters[column] = {};
            
            if (minInput && minInput.value !== '') {
                state.filters[column].min = parseFloat(minInput.value);
            }
            
            if (maxInput && maxInput.value !== '') {
                state.filters[column].max = parseFloat(maxInput.value);
            }
        }
        
        // Boolean filters (checkboxes)
        const checkbox = group.querySelector('input[type="checkbox"]');
        if (checkbox) {
            // Only add to filters if checked
            if (checkbox.checked) {
                state.filters[column] = true;
            }
        }
    });
    
    console.log('Updated filters:', state.filters);
}

// Format a column name for display
function formatColumnName(column) {
    // Special cases for domain filters and custom columns
    if (column === 'PFAM_domain_names') {
        return 'PFAM Domains';
    }
    if (column === 'KOFAM_domain_names') {
        return 'KOFAM Domains';
    }
    if (column === 'origin_seq_length') {
        return 'Protein Length';
    }
    
    // Replace underscores with spaces
    let formatted = column.replace(/_/g, ' ');
    
    // Remove percentage sign from column name (will be added in the UI)
    formatted = formatted.replace(/%/g, ' Percent ');
    
    // Capitalize first letter
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    
    return formatted;
}

// Update the summary display
function updateSummary(summary) {
    const summaryContainer = document.getElementById('summary-container');
    summaryContainer.innerHTML = '';
    
    // Create summary sections
    const sections = [
        {
            title: 'Dataset Overview',
            items: [
                { label: 'Total Rows', value: formatNumber(summary.total_rows) },
                { label: 'Unique Sequences', value: formatNumber(summary.unique_mimic_genes) },
                { label: 'Unique MHC Types', value: formatNumber(summary.unique_mhc_types) },
                { label: 'Unique Cancer Accessions', value: formatNumber(summary.unique_cancer_accs) }
            ]
        },
        {
            title: 'Binding Levels',
            items: Object.entries(summary.binding_level_counts).map(([level, count]) => {
                return { label: level, value: formatNumber(count) };
            })
        },
        {
            title: 'Domain Annotations',
            items: [
                { label: 'PFAM Coverage', value: `${formatNumber(summary.pfam_stats.total_sequences_with_domains)} sequences` },
                { label: 'Avg PFAM Domains', value: formatNumber(summary.pfam_stats.avg_domains_per_sequence) },
                { label: 'KOFAM Coverage', value: `${formatNumber(summary.kofam_stats.total_sequences_with_domains)} sequences` },
                { label: 'Avg KOFAM Domains', value: formatNumber(summary.kofam_stats.avg_domains_per_sequence) }
            ]
        }
    ];
    
    // Add sequence length section if available
    if (summary.sequence_length_stats) {
        sections.push({
            title: 'Protein Lengths',
            items: [
                { label: 'Sequences with Length Data', value: `${formatNumber(summary.sequence_length_stats.sequences_with_length_data)} (${summary.sequence_length_stats.percent_with_length_data.toFixed(1)}%)` },
                { label: 'Min Length', value: formatNumber(summary.sequence_length_stats.min_length) },
                { label: 'Max Length', value: formatNumber(summary.sequence_length_stats.max_length) },
                { label: 'Mean Length', value: formatNumber(summary.sequence_length_stats.mean_length) },
                { label: 'Median Length', value: formatNumber(summary.sequence_length_stats.median_length) }
            ]
        });
    }
    
    // Create HTML for each section
    sections.forEach(section => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'summary-section mb-3';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'summary-title';
        titleEl.textContent = section.title;
        sectionEl.appendChild(titleEl);
        
        const itemsEl = document.createElement('div');
        
        section.items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'summary-item';
            itemEl.innerHTML = `
                <span class="summary-label">${item.label}:</span>
                <span class="summary-value">${item.value}</span>
            `;
            itemsEl.appendChild(itemEl);
        });
        
        sectionEl.appendChild(itemsEl);
        summaryContainer.appendChild(sectionEl);
    });
}
