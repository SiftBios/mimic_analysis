// File: static/js/main.js
// Main JavaScript functionality for the application

// Global state
const state = {
    metadata: null,
    currentData: [],        // Paginated data for table display
    visualizationData: {    // Pre-aggregated data for visualizations
        total_rows: 0,
        mhc_counts: {},
        affinity_data: [],
        pfam_domains: [],
        kofam_domains: []
    },
    currentPage: 0,
    pageSize: 100,
    totalRows: 0,
    totalPages: 0,
    filters: {},
    sortColumn: null,
    sortDirection: 'asc',
    selectedColumns: [],
    selectedRows: new Set(),
    selectedAllFiltered: false, // Whether to use all filtered data for visualization
    defaultColumns: [
        'mimic_gene', 'MHC', 'cancer_acc', 'mimic_Peptide', 
        'mimic_Score_EL', 'mimic_%Rank_EL', 'mimic_Aff(nM)', 'mimic_BindLevel',
        'origin_seq_length', 
        'PFAM_domain_names', 'KOFAM_domain_names',
        'PFAM_domain_count', 'KOFAM_domain_count'
    ]
};

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    
    // Initialize all Bootstrap dropdowns
    const dropdownElementList = document.querySelectorAll('.dropdown-toggle');
    const dropdownList = [...dropdownElementList].map(dropdownToggleEl => {
        return new bootstrap.Dropdown(dropdownToggleEl);
    });
});

// Add this to the beginning of main.js or in the browser console for debugging
document.addEventListener('DOMContentLoaded', function() {
    console.log('Checking important DOM elements:');
    const elementsToCheck = [
        'filter-container', 'filter-loading', 
        'summary-container', 'summary-loading',
        'data-table', 'table-loading', 'no-data-message',
        'page-select', 'page-size-select', 'pagination-info',
        'mhc-plot', 'affinity-plot', 'domain-plot'
    ];
    
    elementsToCheck.forEach(id => {
        const element = document.getElementById(id);
        console.log(`Element #${id}: ${element ? 'Found' : 'MISSING'}`);
    });
});

// Initialize the application
async function initializeApp() {
    try {
        // Load column metadata
        state.metadata = await fetchColumnMetadata();
        
        // Initialize filters based on metadata
        initializeFilters(state.metadata);
        
        // Initialize columns selection
        initializeColumnSelection(state.metadata);
        
        // Set initial selected columns
        state.selectedColumns = [...state.defaultColumns];
        
        // Initialize data table
        initializeDataTable();
        
        // Load initial data
        await loadData();
        
        // Load summary data
        await loadSummary();
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Error initializing application:', error);
        showError('Failed to initialize application. Please refresh the page.');
    }
}

// Fetch column metadata from API
async function fetchColumnMetadata() {
    try {
        const response = await fetch('/api/metadata');
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching metadata:', error);
        throw error;
    }
}

// Load data from API with current state (filters, pagination, sorting)
async function loadData() {
    // Show loading indicator
    document.getElementById('table-loading').style.display = 'block';
    document.getElementById('data-table').style.display = 'none';
    document.getElementById('no-data-message').classList.add('d-none');
    
    try {
        // Prepare URL with query parameters for paginated data
        const tableDataUrl = new URL('/api/data', window.location.origin);
        tableDataUrl.searchParams.append('page', state.currentPage);
        tableDataUrl.searchParams.append('page_size', state.pageSize);
        
        // Add filters
        if (Object.keys(state.filters).length > 0) {
            tableDataUrl.searchParams.append('filters', JSON.stringify(state.filters));
        }
        
        // Add sorting
        if (state.sortColumn) {
            tableDataUrl.searchParams.append('sort_by', state.sortColumn);
            tableDataUrl.searchParams.append('sort_dir', state.sortDirection);
        }
        
        // Prepare URL for visualization data summaries
        const visualizationDataUrl = new URL('/api/visualization_data', window.location.origin);
        if (Object.keys(state.filters).length > 0) {
            visualizationDataUrl.searchParams.append('filters', JSON.stringify(state.filters));
        }
        
        // Fetch both paginated and visualization data in parallel
        const [tableDataResponse, visualizationDataResponse] = await Promise.all([
            fetch(tableDataUrl),
            fetch(visualizationDataUrl)
        ]);
        
        if (!tableDataResponse.ok) {
            throw new Error(`HTTP error ${tableDataResponse.status} loading table data`);
        }
        
        if (!visualizationDataResponse.ok) {
            throw new Error(`HTTP error ${visualizationDataResponse.status} loading visualization data`);
        }
        
        const [tableData, visualizationData] = await Promise.all([
            tableDataResponse.json(),
            visualizationDataResponse.json()
        ]);
        
        // Update state with paginated data
        state.currentData = tableData.data;
        state.totalRows = tableData.total_rows;
        state.totalPages = tableData.total_pages;
        
        // Update state with visualization data summaries
        state.visualizationData = visualizationData;
        
        // Update UI
        updateTable();
        updatePagination();
        
        // Update all filtered data count badges
        const filteredCountBadge = document.getElementById('filtered-count-badge');
        if (filteredCountBadge) {
            filteredCountBadge.textContent = state.visualizationData.total_rows;
        }
        
        // Update the badge on the top button as well
        const topFilteredCount = document.getElementById('top-filtered-count');
        if (topFilteredCount) {
            topFilteredCount.textContent = state.visualizationData.total_rows;
        }
        
        // Update the top button appearance based on the selected state
        const useAllDataBtn = document.getElementById('use-all-data-btn');
        if (useAllDataBtn) {
            if (state.selectedAllFiltered) {
                useAllDataBtn.classList.remove('btn-outline-success');
                useAllDataBtn.classList.add('btn-success');
            } else {
                useAllDataBtn.classList.remove('btn-success');
                useAllDataBtn.classList.add('btn-outline-success');
            }
        }
        
        // If the user has selected to use all filtered data, update selection UI
        if (state.selectedAllFiltered) {
            updateSelectedAllFilteredUI();
        }
        
        // Update any active visualization with the all filtered data if that option is selected
        if (state.selectedAllFiltered) {
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab) {
                updateAnalysisTab(`#${activeTab.id}`);
            }
        }
        
        // Hide loading indicator
        document.getElementById('table-loading').style.display = 'none';
        
        // Show table or no data message
        if (state.currentData.length > 0) {
            document.getElementById('data-table').style.display = 'table';
            document.getElementById('no-data-message').classList.add('d-none');
        } else {
            document.getElementById('data-table').style.display = 'none';
            document.getElementById('no-data-message').classList.remove('d-none');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('table-loading').style.display = 'none';
        showError('Failed to load data. Please try again.');
    }
}

// Load summary data
// Update loadSummary function in main.js
async function loadSummary() {
    // Show loading indicator
    const summaryLoading = document.getElementById('summary-loading');
    const summaryContainer = document.getElementById('summary-container');
    
    if (!summaryLoading || !summaryContainer) {
        console.error('Summary container elements not found in the DOM');
        return;
    }
    
    summaryLoading.style.display = 'block';
    
    try {
        const response = await fetch('/api/summary');
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        
        const summary = await response.json();
        
        // Update UI
        updateSummary(summary);
        
        // Hide loading indicator
        summaryLoading.style.display = 'none';
    } catch (error) {
        console.error('Error loading summary:', error);
        
        if (summaryLoading) {
            summaryLoading.style.display = 'none';
        }
        
        // Show error message in summary container
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="alert alert-danger">
                    Failed to load summary data.
                </div>
            `;
        }
    }
}

// Set up event listeners for UI interactions
function setupEventListeners() {
    // Apply filters button
    document.getElementById('apply-filters').addEventListener('click', () => {
        // Reset pagination
        state.currentPage = 0;
        
        // Update filters from UI
        updateFiltersFromUI();
        
        // Reload data
        loadData();
    });
    
    // Page size selector
    document.getElementById('page-size-select').addEventListener('change', (event) => {
        state.pageSize = parseInt(event.target.value);
        state.currentPage = 0;
        loadData();
    });
    
    // Page selector
    document.getElementById('page-select').addEventListener('change', (event) => {
        state.currentPage = parseInt(event.target.value);
        loadData();
    });
    
    // Column selector button
    document.getElementById('column-toggle-btn').addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('column-modal'));
        modal.show();
    });
    
    // Apply column selection
    document.getElementById('apply-columns').addEventListener('click', () => {
        // Get selected columns from UI
        const selected = [];
        const checkboxes = document.querySelectorAll('#column-checkboxes input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                selected.push(checkbox.value);
            }
        });
        
        // Update state and UI
        state.selectedColumns = selected;
        updateTable();
        
        // Hide modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('column-modal'));
        modal.hide();
    });
    
    // Select all columns checkbox
    document.getElementById('select-all-columns').addEventListener('change', (event) => {
        const checked = event.target.checked;
        const checkboxes = document.querySelectorAll('#column-checkboxes input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
    });
    
    // Export CSV button
    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
    
    // "Use All Filtered Data" button
    document.getElementById('use-all-data-btn').addEventListener('click', (event) => {
        event.preventDefault(); // Prevent any default button action
        
        console.log('Use all filtered data button clicked');
        
        // Toggle the state
        state.selectedAllFiltered = !state.selectedAllFiltered;
        console.log(`selectedAllFiltered set to: ${state.selectedAllFiltered}`);
        
        // If selecting all filtered, clear individual selections
        if (state.selectedAllFiltered) {
            state.selectedRows.clear();
        }
        
        // Update UI
        updateSelectedAllFilteredUI();
        
        // Update button appearance
        const btn = event.currentTarget; // Use currentTarget to make sure we get the button itself
        if (state.selectedAllFiltered) {
            btn.classList.remove('btn-outline-success');
            btn.classList.add('btn-success');
        } else {
            btn.classList.remove('btn-success');
            btn.classList.add('btn-outline-success');
        }
        
        // Update analysis
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab) {
            console.log(`Updating active tab: ${activeTab.id}`);
            updateAnalysisTab(`#${activeTab.id}`);
        } else {
            console.error('No active tab found');
        }
    });
    
    // Analysis tab buttons
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tabEl => {
        tabEl.addEventListener('shown.bs.tab', (event) => {
            const targetTab = event.target.getAttribute('data-bs-target');
            
            // Only update visualization if we have data selected
            if (state.selectedAllFiltered || state.selectedRows.size > 0) {
                updateAnalysisTab(targetTab);
            } else {
                // No data selected, make sure the help message is visible
                const tabPane = document.querySelector(targetTab);
                if (tabPane) {
                    const helpMessage = tabPane.querySelector('.alert-info');
                    if (helpMessage) {
                        helpMessage.style.display = 'block';
                    }
                    
                    // Remove any other content
                    const nonHelpElements = tabPane.querySelectorAll(':scope > *:not(.alert-info)');
                    nonHelpElements.forEach(el => el.remove());
                }
            }
        });
    });
}

// Show error message to user
function showError(message) {
    // Create alert element
    const alertEl = document.createElement('div');
    alertEl.className = 'alert alert-danger alert-dismissible fade show';
    alertEl.setAttribute('role', 'alert');
    alertEl.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Append to body
    document.body.prepend(alertEl);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        alertEl.remove();
    }, 5000);
}

// Export data as CSV
function exportCSV() {
    // Only export if data is available
    if (state.currentData.length === 0) {
        showError('No data to export.');
        return;
    }
    
    try {
        // Filter columns to export
        const columns = state.selectedColumns;
        
        // Create CSV content
        let csvContent = columns.join(',') + '\n';
        
        state.currentData.forEach(row => {
            const values = columns.map(column => {
                const value = row[column];
                
                // Handle value formatting for CSV
                if (value === null || value === undefined) {
                    return '';
                } else if (typeof value === 'string') {
                    // Escape double quotes and wrap in quotes
                    return `"${value.replace(/"/g, '""')}"`;
                } else {
                    return value;
                }
            });
            
            csvContent += values.join(',') + '\n';
        });
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'mimic_data_export.csv');
        link.style.visibility = 'hidden';
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Error exporting data:', error);
        showError('Failed to export data. Please try again.');
    }
}

// Global variable to store the Bootstrap modal instance
let detailsModal = null;

// Function to show sequence details
function showSequenceDetails(sequenceId) {
    console.log(`Showing details for sequence: ${sequenceId}`);
    
    // Let's try a completely different approach - recreate the modal in jQuery style
    // First, remove any existing modal
    let existingModal = document.getElementById('detail-modal');
    if (existingModal) {
        // Try to dispose the Bootstrap modal properly
        if (detailsModal) {
            try {
                detailsModal.dispose();
            } catch (e) {
                console.warn('Could not dispose modal properly:', e);
            }
        }
        
        // Remove from DOM
        existingModal.remove();
    }
    
    // Create a fresh modal
    const freshModal = document.createElement('div');
    freshModal.id = 'detail-modal';
    freshModal.className = 'modal fade';
    freshModal.setAttribute('tabindex', '-1');
    freshModal.setAttribute('aria-labelledby', 'detail-modal-label');
    freshModal.setAttribute('aria-hidden', 'true');
    freshModal.setAttribute('data-bs-backdrop', 'static');
    
    freshModal.innerHTML = `
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="detail-modal-label">Sequence Details: ${sequenceId}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="detail-modal-body">
                <!-- Sequence details will be loaded here -->
                <div class="text-center p-5" id="detail-loading">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2">Loading sequence details...</p>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="close-modal-btn">Close</button>
                <a href="/sequence/${sequenceId}" class="btn btn-primary" id="view-full-analysis-btn" target="_blank">View Full Analysis</a>
            </div>
        </div>
    </div>`;
    
    // Add to DOM
    document.body.appendChild(freshModal);
    
    // Create and store Bootstrap modal
    detailsModal = new bootstrap.Modal(freshModal);
    
    // Show it
    detailsModal.show();
    
    // Add event for when the modal is hidden
    freshModal.addEventListener('hidden.bs.modal', function() {
        console.log('Modal hidden event - cleanup');
        // Remove modal from DOM when hidden to avoid conflicts
        if (freshModal.parentNode) {
            // Only dispose if we're removing
            if (detailsModal) {
                try {
                    detailsModal.dispose();
                    detailsModal = null;
                } catch (e) {
                    console.warn('Error disposing modal:', e);
                }
            }
            freshModal.remove();
        }
    });
    
    // Fetch the data
    fetch(`/api/domains/${sequenceId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Get the modal body element
            const modalBody = document.getElementById('detail-modal-body');
            if (!modalBody) {
                console.error('Modal body element not found after fetch');
                return;
            }
            
            // Remove loading indicator
            const loadingElement = document.getElementById('detail-loading');
            if (loadingElement) {
                loadingElement.remove();
            }
            
            // Update modal content
            updateSequenceDetailsModal(data);
        })
        .catch(error => {
            console.error('Error fetching sequence details:', error);
            
            // Get the modal body element
            const modalBody = document.getElementById('detail-modal-body');
            if (!modalBody) {
                console.error('Modal body not found when handling error');
                return;
            }
            
            // Replace contents with error message
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    Failed to load sequence details: ${error.message}
                    <button type="button" class="btn btn-sm btn-outline-danger mt-2" onclick="showSequenceDetails('${sequenceId}')">
                        Try Again
                    </button>
                </div>
            `;
        });
}

// Update UI based on whether "All Filtered Data" is selected
function updateSelectedAllFilteredUI() {
    // Update the checkbox in the table header
    const selectAllCheckbox = document.querySelector('#data-table thead tr th:first-child input[type="checkbox"]');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = state.selectedAllFiltered;
        selectAllCheckbox.indeterminate = !state.selectedAllFiltered && state.selectedRows.size > 0;
    }
    
    // Update all row checkboxes
    const rowCheckboxes = document.querySelectorAll('#data-table tbody input[type="checkbox"]');
    rowCheckboxes.forEach(checkbox => {
        checkbox.checked = state.selectedAllFiltered;
    });
    
    // Update row highlighting
    const rows = document.querySelectorAll('#data-table tbody tr');
    rows.forEach(row => {
        if (state.selectedAllFiltered) {
            row.classList.add('table-row-selected');
        } else {
            row.classList.remove('table-row-selected');
        }
    });
    
    // Update the "Use all filtered data" menu item to show as active
    const useAllFilteredLink = document.getElementById('use-all-filtered-data');
    if (useAllFilteredLink) {
        if (state.selectedAllFiltered) {
            useAllFilteredLink.classList.add('active');
            useAllFilteredLink.innerHTML = '✓ Using all filtered data ';
        } else {
            useAllFilteredLink.classList.remove('active');
            useAllFilteredLink.innerHTML = 'Use all filtered data for visualization ';
        }
        
        // Add the badge back if it was removed during the HTML update
        const badge = document.getElementById('filtered-count-badge');
        if (!badge) {
            const newBadge = document.createElement('span');
            newBadge.className = 'badge bg-primary ms-2';
            newBadge.id = 'filtered-count-badge';
            newBadge.textContent = state.visualizationData.total_rows;
            useAllFilteredLink.appendChild(newBadge);
        }
    }
    
    // Update the active tab visualization if we have data
    if (state.selectedAllFiltered && state.visualizationData.total_rows > 0) {
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab) {
            updateAnalysisTab(`#${activeTab.id}`);
        }
    }
    
    // Update alert messages in analysis tabs - remove the "select data" messages when using all filtered data
    if (state.selectedAllFiltered) {
        document.querySelectorAll('.tab-pane .alert-info').forEach(alert => {
            alert.style.display = 'none';
        });
    } else {
        document.querySelectorAll('.tab-pane .alert-info').forEach(alert => {
            alert.style.display = 'block';
        });
    }
}

// Update the active analysis tab with visualizations
function updateAnalysisTab(tabId) {
    console.log(`Updating analysis tab: ${tabId}`);
    
    // First, clear the specific visualization container to prevent issues with multiple charts
    let plotContainer;
    
    switch (tabId) {
        case '#mhc-distribution':
            plotContainer = document.getElementById('mhc-plot');
            break;
        case '#binding-affinity':
            plotContainer = document.getElementById('affinity-plot');
            break;
        case '#domain-distribution':
            plotContainer = document.getElementById('domain-plot');
            break;
    }
    
    // Clear the plot container if it exists
    if (plotContainer) {
        console.log(`Clearing plot container for ${tabId}`);
        plotContainer.innerHTML = '';
    }
    
    if (state.selectedAllFiltered) {
        console.log(`Using all filtered data (${state.visualizationData.total_rows} records)`);
        
        // Use pre-aggregated data for all filtered rows
        
        // Show a message about using all filtered data
        const countMessage = document.createElement('div');
        countMessage.className = 'alert alert-success mt-2 mb-2 py-2';
        countMessage.innerHTML = `
            <strong>Visualizing all filtered data:</strong> 
            <span class="badge bg-success">${state.visualizationData.total_rows} records</span>
            <small class="d-block mt-1">All filtered data is being used for visualization regardless of pagination.</small>
        `;
        
        // Get the tab pane container
        const vizContainer = document.querySelector(tabId);
        if (vizContainer) {
            // Remove existing messages
            const existingMessages = vizContainer.querySelectorAll('.alert.mt-2.mb-2.py-2');
            existingMessages.forEach(message => message.remove());
            
            // Add new message
            const helpMessage = vizContainer.querySelector('.alert-info');
            if (helpMessage) {
                helpMessage.style.display = 'none';
                vizContainer.insertBefore(countMessage, helpMessage.nextSibling);
            } else {
                vizContainer.prepend(countMessage);
            }
        }
        
        // Update based on which tab is active using pre-aggregated data
        console.log(`Creating visualization for ${tabId} using pre-aggregated data`);
        
        if (!plotContainer) {
            console.error(`Plot container for ${tabId} not found`);
            return;
        }
        
        switch (tabId) {
            case '#mhc-distribution':
                console.log('Creating MHC distribution chart from summary data');
                console.log('MHC counts:', state.visualizationData.mhc_counts);
                createMHCDistributionChartFromSummary(state.visualizationData.mhc_counts);
                break;
            case '#binding-affinity':
                console.log('Creating binding affinity chart from values');
                console.log('Affinity data points:', state.visualizationData.affinity_data.length);
                createBindingAffinityChartFromValues(state.visualizationData.affinity_data);
                break;
            case '#domain-distribution':
                console.log('Creating domain distribution chart from summary');
                console.log('PFAM domains:', state.visualizationData.pfam_domains.length);
                console.log('KOFAM domains:', state.visualizationData.kofam_domains.length);
                createDomainDistributionChartFromSummary(
                    state.visualizationData.pfam_domains,
                    state.visualizationData.kofam_domains
                );
                break;
        }
    } else {
        // Use only selected rows from current page
        if (state.selectedRows.size === 0) {
            console.log('No rows selected, showing help message only');
            
            // Clear visualizations and show help message
            const vizContainer = document.querySelector(tabId);
            if (vizContainer) {
                // Remove any custom messages
                const customMessages = vizContainer.querySelectorAll('.alert.mt-2.mb-2.py-2');
                customMessages.forEach(message => message.remove());
                
                // Show the default help message
                const helpMessage = vizContainer.querySelector('.alert-info');
                if (helpMessage) {
                    helpMessage.style.display = 'block';
                }
            }
            return;
        }
        
        console.log(`Using selected rows (${state.selectedRows.size} records)`);
        
        // Add a message about using selected rows
        const countMessage = document.createElement('div');
        countMessage.className = 'alert alert-info mt-2 mb-2 py-2';
        countMessage.innerHTML = `
            <strong>Visualizing selected data:</strong> 
            <span class="badge bg-info">${state.selectedRows.size} records</span>
            <small class="d-block mt-1">Only rows selected on the current page are being used for visualization.</small>
        `;
        
        // Get the tab pane container
        const vizContainer = document.querySelector(tabId);
        if (vizContainer) {
            // Remove existing messages
            const existingMessages = vizContainer.querySelectorAll('.alert.mt-2.mb-2.py-2');
            existingMessages.forEach(message => message.remove());
            
            // Add new message
            const helpMessage = vizContainer.querySelector('.alert-info');
            if (helpMessage) {
                helpMessage.style.display = 'none';
                vizContainer.insertBefore(countMessage, helpMessage.nextSibling);
            } else {
                vizContainer.prepend(countMessage);
            }
        }
        
        const dataToUse = state.currentData.filter((_, index) => state.selectedRows.has(index));
        console.log(`Creating visualization for ${tabId} using ${dataToUse.length} selected rows`);
        
        if (!plotContainer) {
            console.error(`Plot container for ${tabId} not found`);
            return;
        }
        
        // Update based on which tab is active
        switch (tabId) {
            case '#mhc-distribution':
                createMHCDistributionChart(dataToUse);
                break;
            case '#binding-affinity':
                createBindingAffinityChart(dataToUse);
                break;
            case '#domain-distribution':
                createDomainDistributionChart(dataToUse);
                break;
        }
    }
}

// Format a number for display
function formatNumber(num) {
    if (num === null || num === undefined) {
        return 'N/A';
    }
    
    if (typeof num === 'number') {
        // Format small decimal numbers more precisely
        if (num < 0.01 && num > 0) {
            return num.toExponential(2);
        }
        
        // Format large numbers with commas
        return num.toLocaleString(undefined, {
            maximumFractionDigits: 2
        });
    }
    
    return num;
}
