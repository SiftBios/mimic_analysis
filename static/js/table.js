// File: static/js/table.js
// Handle the interactive data table functionality

// Initialize the data table
function initializeDataTable() {
    const tableHead = document.querySelector('#data-table thead tr');
    const tableBody = document.querySelector('#data-table tbody');
    
    // Clear existing content
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Add a column for row selection
    const selectAllCell = document.createElement('th');
    selectAllCell.style.width = '40px';
    
    // Create a container for the checkbox and dropdown
    const selectionContainer = document.createElement('div');
    selectionContainer.className = 'selection-controls d-flex align-items-center';
    
    // Create the "Select All" checkbox
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.className = 'form-check-input me-1';
    selectAllCheckbox.title = 'Select/deselect all rows on this page';
    
    // Create a dropdown button for selection options
    const dropdownButton = document.createElement('button');
    dropdownButton.className = 'btn btn-sm btn-link p-0 ms-1 dropdown-toggle';
    dropdownButton.innerHTML = '<i class="bi bi-caret-down-fill"></i>';
    dropdownButton.title = 'Selection options';
    dropdownButton.setAttribute('data-bs-toggle', 'dropdown');
    dropdownButton.setAttribute('aria-expanded', 'false');
    dropdownButton.id = 'table-selection-dropdown';
    
    // Create dropdown menu
    const dropdownMenu = document.createElement('ul');
    dropdownMenu.className = 'dropdown-menu';
    
    // Option: Select all filtered data
    const selectAllFilteredItem = document.createElement('li');
    const selectAllFilteredLink = document.createElement('a');
    selectAllFilteredLink.className = 'dropdown-item';
    selectAllFilteredLink.href = '#';
    selectAllFilteredLink.id = 'use-all-filtered-data';
    selectAllFilteredLink.innerHTML = 'Use all filtered data for visualization';
    
    // Add a badge to show how many records will be used
    const filterCountBadge = document.createElement('span');
    filterCountBadge.className = 'badge bg-primary ms-2';
    filterCountBadge.id = 'filtered-count-badge';
    filterCountBadge.textContent = '0';
    selectAllFilteredLink.appendChild(filterCountBadge);
    
    selectAllFilteredLink.addEventListener('click', (event) => {
        event.preventDefault();
        
        // Toggle the state
        state.selectedAllFiltered = !state.selectedAllFiltered;
        
        // If selecting all filtered, clear individual selections
        if (state.selectedAllFiltered) {
            state.selectedRows.clear();
        }
        
        // Update UI
        updateSelectedAllFilteredUI();
        
        // Update analysis
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab) {
            updateAnalysisTab(`#${activeTab.id}`);
        }
    });
    selectAllFilteredItem.appendChild(selectAllFilteredLink);
    dropdownMenu.appendChild(selectAllFilteredItem);
    
    // Option: Clear selection
    const clearSelectionItem = document.createElement('li');
    const clearSelectionLink = document.createElement('a');
    clearSelectionLink.className = 'dropdown-item';
    clearSelectionLink.href = '#';
    clearSelectionLink.textContent = 'Clear all selections';
    clearSelectionLink.addEventListener('click', (event) => {
        event.preventDefault();
        
        // Clear all selections
        state.selectedRows.clear();
        state.selectedAllFiltered = false;
        
        // Update UI
        updateSelectedAllFilteredUI();
        
        // Reset the menu item for "Use all filtered data"
        const useAllFilteredLink = document.getElementById('use-all-filtered-data');
        if (useAllFilteredLink) {
            useAllFilteredLink.classList.remove('active');
            useAllFilteredLink.innerHTML = 'Use all filtered data for visualization ';
            
            // Re-add the badge if needed
            if (!document.getElementById('filtered-count-badge')) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-primary ms-2';
                badge.id = 'filtered-count-badge';
                badge.textContent = state.visualizationData.total_rows;
                useAllFilteredLink.appendChild(badge);
            }
        }
        
        // Reset the top button appearance
        const useAllDataBtn = document.getElementById('use-all-data-btn');
        if (useAllDataBtn) {
            useAllDataBtn.classList.remove('btn-success');
            useAllDataBtn.classList.add('btn-outline-success');
        }
        
        // Clear any visualizations
        const tabs = ['mhc-plot', 'affinity-plot', 'domain-plot'];
        tabs.forEach(tabId => {
            const container = document.getElementById(tabId);
            if (container) {
                // Remove existing visualizations
                container.innerHTML = '';
                
                // Show the default help message in parent container
                const parentTab = container.closest('.tab-pane');
                if (parentTab) {
                    const helpMessage = parentTab.querySelector('.alert-info');
                    if (helpMessage) {
                        helpMessage.style.display = 'block';
                    }
                }
            }
        });
    });
    clearSelectionItem.appendChild(clearSelectionLink);
    dropdownMenu.appendChild(clearSelectionItem);
    
    // Create dropdown container with proper Bootstrap classes
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'dropdown d-inline-block';
    dropdownContainer.appendChild(dropdownButton);
    dropdownContainer.appendChild(dropdownMenu);
    
    // Add event listener for the "Select All" checkbox
    selectAllCheckbox.addEventListener('change', (event) => {
        const checked = event.target.checked;
        
        // If using all filtered data, toggle that off
        if (state.selectedAllFiltered) {
            state.selectedAllFiltered = false;
            
            // Update the UI for the "Use all filtered data" option
            const useAllFilteredLink = document.getElementById('use-all-filtered-data');
            if (useAllFilteredLink) {
                useAllFilteredLink.classList.remove('active');
                useAllFilteredLink.innerHTML = 'Use all filtered data for visualization ';
                
                // Re-add the badge if needed
                if (!document.getElementById('filtered-count-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'badge bg-primary ms-2';
                    badge.id = 'filtered-count-badge';
                    badge.textContent = state.visualizationData.total_rows;
                    useAllFilteredLink.appendChild(badge);
                }
            }
        }
        
        // Update all row checkboxes
        const checkboxes = document.querySelectorAll('#data-table tbody input[type="checkbox"]');
        checkboxes.forEach((checkbox, index) => {
            checkbox.checked = checked;
            
            // Update selected rows state
            if (checked) {
                state.selectedRows.add(index);
            } else {
                state.selectedRows.delete(index);
            }
        });
        
        // Update row highlighting
        updateRowHighlighting();
        
        // Update analysis if any rows are selected
        if (state.selectedRows.size > 0) {
            // Get active tab
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab) {
                updateAnalysisTab(`#${activeTab.id}`);
            }
        } else {
            // Clear visualizations if no rows are selected
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab) {
                // Show the default help message
                const helpMessage = activeTab.querySelector('.alert-info');
                if (helpMessage) {
                    helpMessage.style.display = 'block';
                }
                
                // Remove any other content
                const plotContainer = activeTab.querySelector('.analysis-plot');
                if (plotContainer) {
                    plotContainer.innerHTML = '';
                }
            }
        }
    });
    
    // Assemble the selection controls
    selectionContainer.appendChild(selectAllCheckbox);
    selectionContainer.appendChild(dropdownContainer);
    selectAllCell.appendChild(selectionContainer);
    tableHead.appendChild(selectAllCell);
    
    // Add default header cells (will be populated later)
    state.selectedColumns.forEach(() => {
        const th = document.createElement('th');
        tableHead.appendChild(th);
    });
}

// Update the table with current data
function updateTable() {
    const tableHead = document.querySelector('#data-table thead tr');
    const tableBody = document.querySelector('#data-table tbody');
    
    // Clear existing content (except the first checkbox column)
    while (tableHead.children.length > 1) {
        tableHead.removeChild(tableHead.lastChild);
    }
    tableBody.innerHTML = '';
    
    // Update header cells
    state.selectedColumns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        th.classList.add('sortable');
        
        // Add sort indicator if this column is sorted
        if (state.sortColumn === column) {
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.textContent = state.sortDirection === 'asc' ? ' ▲' : ' ▼';
            th.appendChild(indicator);
        }
        
        // Add click event for sorting
        th.addEventListener('click', () => {
            // Toggle direction if already sorting by this column
            if (state.sortColumn === column) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = column;
                state.sortDirection = 'asc';
            }
            
            // Reset page
            state.currentPage = 0;
            
            // Reload data
            loadData();
        });
        
        tableHead.appendChild(th);
    });
    
    // Add data rows
    state.currentData.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        
        // Add checkbox cell
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.checked = state.selectedRows.has(rowIndex);
        
        checkbox.addEventListener('change', (event) => {
            // If we were using all filtered data, turn that off since we're now
            // selecting individual rows
            if (state.selectedAllFiltered) {
                state.selectedAllFiltered = false;
                
                // Update the UI for the "Use all filtered data" option
                const useAllFilteredLink = document.getElementById('use-all-filtered-data');
                if (useAllFilteredLink) {
                    useAllFilteredLink.classList.remove('active');
                    useAllFilteredLink.innerHTML = 'Use all filtered data for visualization ';
                    
                    // Re-add the badge if needed
                    if (!document.getElementById('filtered-count-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-primary ms-2';
                        badge.id = 'filtered-count-badge';
                        badge.textContent = state.visualizationData.total_rows;
                        useAllFilteredLink.appendChild(badge);
                    }
                }
            }
            
            if (event.target.checked) {
                state.selectedRows.add(rowIndex);
            } else {
                state.selectedRows.delete(rowIndex);
            }
            
            // Update row highlighting
            updateRowHighlighting();
            
            // Update analysis if any rows are selected
            if (state.selectedRows.size > 0) {
                // Get active tab
                const activeTab = document.querySelector('.tab-pane.active');
                if (activeTab) {
                    updateAnalysisTab(`#${activeTab.id}`);
                }
            } else {
                // Clear visualizations if no rows are selected
                const activeTab = document.querySelector('.tab-pane.active');
                if (activeTab) {
                    // Show the default help message
                    const helpMessage = activeTab.querySelector('.alert-info');
                    if (helpMessage) {
                        helpMessage.style.display = 'block';
                    }
                    
                    // Remove any other content except the help message
                    const plotContainer = activeTab.querySelector('.analysis-plot');
                    if (plotContainer) {
                        plotContainer.innerHTML = '';
                    }
                    
                    // Remove any custom messages
                    const customMessages = activeTab.querySelectorAll('.alert:not(.alert-info)');
                    customMessages.forEach(msg => msg.remove());
                }
            }
            
            // Update the checkbox in the table header (indeterminate state)
            const selectAllCheckbox = document.querySelector('#data-table thead tr th:first-child input[type="checkbox"]');
            if (selectAllCheckbox) {
                if (state.selectedRows.size === 0) {
                    selectAllCheckbox.checked = false;
                    selectAllCheckbox.indeterminate = false;
                } else if (state.selectedRows.size === document.querySelectorAll('#data-table tbody tr').length) {
                    selectAllCheckbox.checked = true;
                    selectAllCheckbox.indeterminate = false;
                } else {
                    selectAllCheckbox.checked = false;
                    selectAllCheckbox.indeterminate = true;
                }
            }
        });
        
        checkboxCell.appendChild(checkbox);
        tr.appendChild(checkboxCell);
        
        // Add data cells
        state.selectedColumns.forEach(column => {
            const td = document.createElement('td');
            
            // Format cell content based on data type
            let cellContent = row[column];
            
            // Special handling for PFAM and KOFAM domains (JSON)
            if (column === 'PFAM_domains' || column === 'KOFAM_domains') {
                try {
                    const domains = JSON.parse(cellContent);
                    cellContent = domains.length > 0 ? domains.map(d => d.hmm_name).join(', ') : 'None';
                } catch (e) {
                    cellContent = 'Error parsing domains';
                }
            } 
            // Format numeric values
            else if (typeof cellContent === 'number') {
                cellContent = formatNumber(cellContent);
            } 
            // Handle undefined values
            else if (cellContent === undefined || cellContent === null) {
                cellContent = 'N/A';
            }
            
            // Make mimic_gene column clickable to show sequence details
            if (column === 'mimic_gene') {
                td.className = 'clickable-cell';
                td.textContent = cellContent;
                td.addEventListener('click', () => {
                    showSequenceDetails(cellContent);
                });
            } 
            // Make cancer_acc column clickable to go to cancer detail page
            else if (column === 'cancer_acc' && cellContent && cellContent !== 'N/A') {
                td.className = 'clickable-cell';
                td.textContent = cellContent;
                td.title = 'Click to view cancer accession details';
                td.addEventListener('click', () => {
                    window.location.href = `/cancer/${cellContent}`;
                });
            } else {
                td.textContent = cellContent;
            }
            
            tr.appendChild(td);
        });
        
        tableBody.appendChild(tr);
    });
    
    // Update row highlighting
    updateRowHighlighting();
}

// Update pagination controls
function updatePagination() {
    const pageSelect = document.getElementById('page-select');
    const paginationInfo = document.getElementById('pagination-info');
    
    // Clear existing options
    pageSelect.innerHTML = '';
    
    // Add page options
    for (let i = 0; i < state.totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i + 1}`;
        option.selected = i === state.currentPage;
        pageSelect.appendChild(option);
    }
    
    // Update pagination info text
    const start = state.currentPage * state.pageSize + 1;
    const end = Math.min(start + state.pageSize - 1, state.totalRows);
    paginationInfo.textContent = `Showing ${start} to ${end} of ${state.totalRows} entries`;
}

// Initialize column selection modal
function initializeColumnSelection(metadata) {
    const columnCheckboxes = document.getElementById('column-checkboxes');
    columnCheckboxes.innerHTML = '';
    
    // Add a checkbox for each column
    Object.keys(metadata).forEach(column => {
        const div = document.createElement('div');
        div.className = 'form-check';
        
        const input = document.createElement('input');
        input.className = 'form-check-input';
        input.type = 'checkbox';
        input.id = `column-${column}`;
        input.value = column;
        input.checked = state.defaultColumns.includes(column);
        
        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = `column-${column}`;
        label.textContent = column;
        
        div.appendChild(input);
        div.appendChild(label);
        columnCheckboxes.appendChild(div);
    });
}

// Update row highlighting based on selection
function updateRowHighlighting() {
    const rows = document.querySelectorAll('#data-table tbody tr');
    
    rows.forEach((row, index) => {
        if (state.selectedRows.has(index)) {
            row.classList.add('table-row-selected');
        } else {
            row.classList.remove('table-row-selected');
        }
    });
}

// Update sequence details modal with domain information
function updateSequenceDetailsModal(data) {
    const modalBody = document.getElementById('detail-modal-body');
    modalBody.innerHTML = '';
    
    // Create sequence information section
    const sequenceInfoSection = document.createElement('div');
    
    // Add sequence ID header
    const sequenceHeader = document.createElement('h5');
    sequenceHeader.textContent = data.sequence_id;
    sequenceInfoSection.appendChild(sequenceHeader);
    
    // Find sequence in current data if available
    const sequenceData = state.currentData.find(row => row.mimic_gene === data.sequence_id);
    
    if (sequenceData) {
        // Add basic information table
        const infoTable = document.createElement('table');
        infoTable.className = 'table table-sm';
        
        const tbody = document.createElement('tbody');
        
        // Add key information rows
        const infoFields = [
            { label: 'MHC Type', field: 'MHC' },
            { label: 'Peptide', field: 'mimic_Peptide' },
            { label: 'Binding Score', field: 'mimic_Score_EL' },
            { label: 'Rank', field: 'mimic_%Rank_EL' },
            { label: 'Affinity', field: 'mimic_Aff(nM)' },
            { label: 'Binding Level', field: 'mimic_BindLevel' }
        ];
        
        infoFields.forEach(info => {
            if (sequenceData[info.field]) {
                const tr = document.createElement('tr');
                
                const th = document.createElement('th');
                th.style.width = '150px';
                th.textContent = info.label;
                
                const td = document.createElement('td');
                td.textContent = sequenceData[info.field];
                
                tr.appendChild(th);
                tr.appendChild(td);
                tbody.appendChild(tr);
            }
        });
        
        infoTable.appendChild(tbody);
        sequenceInfoSection.appendChild(infoTable);
    }
    
    modalBody.appendChild(sequenceInfoSection);
    
    // Create domain visualization section
    const domainSection = document.createElement('div');
    domainSection.className = 'domain-container';
    
    // Add section header
    const domainHeader = document.createElement('h5');
    domainHeader.className = 'mt-4';
    domainHeader.textContent = 'Domain Annotations';
    domainSection.appendChild(domainHeader);
    
    // Create PFAM domains section
    if (data.pfam_domains && data.pfam_domains.length > 0) {
        // Add subheader
        const pfamHeader = document.createElement('h6');
        pfamHeader.className = 'mt-3';
        pfamHeader.innerHTML = `<span class="domain-badge pfam-badge">PFAM</span> Domains (${data.pfam_domains.length})`;
        domainSection.appendChild(pfamHeader);
        
        // Create visual representation of domains
        const pfamVisual = document.createElement('div');
        pfamVisual.className = 'domain-visual';
        
        // Find the sequence length if available
        let maxEnd = 0;
        data.pfam_domains.forEach(domain => {
            if (domain.end > maxEnd) {
                maxEnd = domain.end;
            }
        });
        
        // Add each domain to the visualization
        data.pfam_domains.forEach(domain => {
            const domainEl = document.createElement('div');
            domainEl.className = 'domain-item pfam-domain';
            
            // Calculate position and width
            const startPercent = (domain.start / maxEnd) * 100;
            const widthPercent = ((domain.end - domain.start) / maxEnd) * 100;
            
            domainEl.style.left = `${startPercent}%`;
            domainEl.style.width = `${widthPercent}%`;
            domainEl.textContent = domain.hmm_name;
            
            // Add tooltip
            domainEl.title = `${domain.hmm_name} (${domain.start}-${domain.end})`;
            
            pfamVisual.appendChild(domainEl);
        });
        
        domainSection.appendChild(pfamVisual);
        
        // Add domain list
        const pfamList = document.createElement('div');
        pfamList.className = 'domain-list';
        
        data.pfam_domains.forEach(domain => {
            const domainItem = document.createElement('div');
            domainItem.className = 'domain-list-item';
            domainItem.innerHTML = `
                <strong>${domain.hmm_name}</strong>
                <div>Position: ${domain.start}-${domain.end}</div>
                <div>Bit Score: ${formatNumber(domain.bitscore)}</div>
                <div>E-value: ${formatNumber(domain.e_value)}</div>
            `;
            pfamList.appendChild(domainItem);
        });
        
        domainSection.appendChild(pfamList);
    } else {
        // No PFAM domains
        const noPfam = document.createElement('div');
        noPfam.className = 'alert alert-light';
        noPfam.textContent = 'No PFAM domains found for this sequence.';
        domainSection.appendChild(noPfam);
    }
    
    // Create KOFAM domains section
    if (data.kofam_domains && data.kofam_domains.length > 0) {
        // Add subheader
        const kofamHeader = document.createElement('h6');
        kofamHeader.className = 'mt-4';
        kofamHeader.innerHTML = `<span class="domain-badge kofam-badge">KOFAM</span> Domains (${data.kofam_domains.length})`;
        domainSection.appendChild(kofamHeader);
        
        // Create visual representation of domains
        const kofamVisual = document.createElement('div');
        kofamVisual.className = 'domain-visual';
        
        // Find the sequence length if available
        let maxEnd = 0;
        data.kofam_domains.forEach(domain => {
            if (domain.end > maxEnd) {
                maxEnd = domain.end;
            }
        });
        
        // Add each domain to the visualization
        data.kofam_domains.forEach(domain => {
            const domainEl = document.createElement('div');
            domainEl.className = 'domain-item kofam-domain';
            
            // Calculate position and width
            const startPercent = (domain.start / maxEnd) * 100;
            const widthPercent = ((domain.end - domain.start) / maxEnd) * 100;
            
            domainEl.style.left = `${startPercent}%`;
            domainEl.style.width = `${widthPercent}%`;
            domainEl.textContent = domain.hmm_name;
            
            // Add tooltip
            domainEl.title = `${domain.hmm_name} (${domain.start}-${domain.end})`;
            
            kofamVisual.appendChild(domainEl);
        });
        
        domainSection.appendChild(kofamVisual);
        
        // Add domain list
        const kofamList = document.createElement('div');
        kofamList.className = 'domain-list';
        
        data.kofam_domains.forEach(domain => {
            const domainItem = document.createElement('div');
            domainItem.className = 'domain-list-item';
            domainItem.innerHTML = `
                <strong>${domain.hmm_name}</strong>
                <div>Position: ${domain.start}-${domain.end}</div>
                <div>Bit Score: ${formatNumber(domain.bitscore)}</div>
                <div>E-value: ${formatNumber(domain.e_value)}</div>
            `;
            kofamList.appendChild(domainItem);
        });
        
        domainSection.appendChild(kofamList);
    } else {
        // No KOFAM domains
        const noKofam = document.createElement('div');
        noKofam.className = 'alert alert-light';
        noKofam.textContent = 'No KOFAM domains found for this sequence.';
        domainSection.appendChild(noKofam);
    }
    
    modalBody.appendChild(domainSection);
    
    // Add link to full analysis page
    const analysisLinkSection = document.createElement('div');
    analysisLinkSection.className = 'mt-4 text-center';
    analysisLinkSection.innerHTML = `
        <p>For more detailed analysis of this sequence, click the "View Full Analysis" button below.</p>
    `;
    modalBody.appendChild(analysisLinkSection);
}
