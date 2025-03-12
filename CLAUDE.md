# Mimic Identification Pipeline - Project Documentation

## Overview
This web application provides an interactive interface for analyzing protein sequence data from a mimic identification pipeline. It allows users to explore relationships between protein sequences, their HMM domain annotations (from PFAM and KOFAM), and MHC-I binding affinity results.

## Core Features
1. **Interactive Data Table**
   - Display merged data from multiple sources (binders CSV and HMM annotations)
   - Filter by substring search for text columns
   - Filter by numerical thresholds for numeric columns
   - Sort by any column
   - Select rows for detailed analysis

2. **Analysis Visualizations**
   - MHC Distribution: Analyze distribution of MHC types
   - Binding Affinity: Visualize binding affinity distributions
   - Domain Distribution: Explore PFAM and KOFAM domains

3. **Sequence Detail View**
   - Comprehensive sequence analysis page
   - Multi-row domain architecture visualization
   - Detailed binding information
   - Cancer association details
   - Related sequences discovery
   - FASTA sequence display

## Project Structure

```
/mimic-pipeline/
├── CLAUDE.md                      # This project documentation
├── README.md                      # User-focused documentation
├── server.py                      # Main Flask server script
├── data_processor.py              # Data processing module
├── requirements.txt               # Python dependencies
├── static/                        # Frontend static files
│   ├── css/
│   │   └── styles.css             # CSS styles
│   ├── js/
│   │   ├── main.js                # Main JavaScript functionality
│   │   ├── table.js               # Interactive table handling
│   │   ├── filters.js             # Filter implementation
│   │   ├── visualizations.js      # Data visualization scripts
│   │   └── sequence_detail.js     # Sequence detail page visualizations
│   └── img/
│       └── favicon.svg            # Favicon
├── templates/                     # HTML templates
│   ├── index.html                 # Main page template
│   ├── sequence_detail.html       # Sequence detail page
│   └── error.html                 # Error page
```

## Key Files and Their Functions

### Backend (Python)

#### server.py
The main server script that handles HTTP requests and serves the application.

Key functionality:
- Flask routes for main pages and API endpoints
- Data loading and initialization
- Error handling

API endpoints:
- `/api/data`: Retrieves paginated, filtered, and sorted data
- `/api/metadata`: Provides column metadata for UI filtering
- `/api/summary`: Returns statistical summary of the dataset
- `/api/domains/<sequence_id>`: Gets detailed domain info for a sequence
- `/sequence/<sequence_id>`: Renders the sequence detail page with comprehensive analysis

#### data_processor.py
Handles data loading, processing, and merging from multiple sources.

Key functionality:
- `MimicDataProcessor` class: Core data handling
- `load_data()`: Loads CSV/TSV files
- `process_hmm_hits()`: Processes HMM domain annotations
- `merge_data()`: Combines binders data with domain annotations
- `get_column_metadata()`: Generates metadata for UI filtering
- `get_data_summary()`: Creates statistical summary of the data
- `get_sequence_data()`: Retrieves comprehensive data for a specific sequence
- `get_sequence_fasta()`: Extracts sequence content from FASTA files
- `find_related_sequences()`: Identifies sequences with similar domain architecture

### Frontend (HTML/JS/CSS)

#### templates/index.html
Main application interface with interactive table and analysis panels.

Components:
- Filter sidebar
- Data table
- Analysis tabs with visualizations
- Modal dialogs for sequence details and column selection

#### templates/sequence_detail.html
Detailed individual sequence analysis page.

Components:
- Basic sequence information panel
- Domain architecture visualization with multi-row display
- Binding metrics visualizations
- PFAM and KOFAM domain tabs with details
- Binding data table with color-coded levels
- Cancer association information
- Related sequences suggestions

#### static/js/main.js
Core JavaScript functionality for the application.

Key features:
- Application initialization
- Data fetching and state management
- Event handling
- Error handling

#### static/js/table.js
Handles the interactive data table.

Key features:
- Table initialization and updates
- Row selection
- Sorting
- Sequence detail modal

#### static/js/filters.js
Manages filtering functionality.

Key features:
- Dynamic filter generation based on data types
- Filter application
- Summary display

#### static/js/visualizations.js
Creates interactive data visualizations.

Key features:
- MHC distribution charts
- Binding affinity histograms
- Domain distribution charts with separate PFAM and KOFAM tabs

## Input Data Structure

The application processes three main types of input files:

### 1. Merged Better Binders CSV
File pattern: `*_merged_better_binders.csv`

This is the main data file containing MHC binding information. Key columns include:
- `mimic_mhc_type`: Type of MHC (typically "mhcI")
- `MHC`: Specific MHC allele (e.g., "HLA-A*02:03")
- `cancer_acc`: Associated cancer accession
- `cancer_DB`: Cancer database source
- `mimic_gene`: Mimic gene identifier (links to sequences)
- `mimic_Peptide`: Peptide sequence
- `mimic_Score_EL`: Eluted ligand score
- `mimic_%Rank_EL`: Eluted ligand rank percentage
- `mimic_Aff(nM)`: Binding affinity in nanomolar
- `mimic_BindLevel`: Binding level category (e.g., "<= SB" for strong binders)
- Many other metrics and identifiers

### 2. PFAM HMM Hits TSV
File pattern: `*_PFAM_hits.tsv`

Contains PFAM domain annotations for sequences:
- `sequence_id`: Identifier of the sequence (matches `mimic_gene` in binders CSV)
- `hmm_name`: PFAM domain name
- `bitscore`: Score for the domain match
- `evalue`: E-value for statistical significance
- `env_from`: Start position of domain in sequence
- `env_to`: End position of domain in sequence

### 3. KOFAM HMM Hits TSV
File pattern: `*_KOFAM_hits.tsv`

Contains KEGG Orthology domain annotations with the same structure as PFAM hits:
- `sequence_id`: Identifier of the sequence
- `hmm_name`: KOFAM domain identifier
- `bitscore`: Score for the domain match
- `evalue`: E-value for statistical significance
- `env_from`: Start position of domain in sequence
- `env_to`: End position of domain in sequence

### Optional: Sequence FASTA Files
File pattern: `*.faa`

Contains the actual protein sequences in FASTA format. These files can be used for more detailed sequence analysis in future enhancements.

## Data Processing Flow

1. **Data Loading**:
   - Load binders CSV, PFAM, and KOFAM files
   - Extract sample ID from filenames

2. **HMM Processing**:
   - Create mappings from sequence IDs to domain annotations
   - Sanitize and validate domain information

3. **Data Merging**:
   - Add PFAM and KOFAM domain columns to binders data
   - Convert domain information to JSON strings
   - Add domain count columns

4. **Data Serving**:
   - Provide paginated, filtered data to frontend
   - Generate column metadata for filtering
   - Create summary statistics

## Running the Application

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the server:
   ```bash
   python server.py /path/to/data/directory
   ```

3. Access the interface:
   Open a web browser and navigate to http://127.0.0.1:5000

## Troubleshooting

Common issues and their solutions:

### JSON Parsing Errors
The application includes robust error handling for JSON parsing issues. If you encounter problems, check:
- Special characters in sequence identifiers
- NaN or Infinity values in numeric columns
- Corrupted domain entries

### Performance Considerations
- The application filters data server-side to handle large datasets efficiently
- For extremely large files, consider preprocessing or database integration

### Browser Compatibility
- The application works best in modern browsers with ES6+ support
- Chrome, Firefox, and Edge are fully supported

#### static/js/sequence_detail.js
JavaScript for sequence detail page visualizations.

Key features:
- Multi-row domain architecture visualization
- Interactive domain tooltips
- Binding distribution charts
- Sequence display toggle

## Recent Enhancements

### 1. Expanded HMM Annotations Support
- Added support for four annotation files (instead of just two):
  - PFAM and KOFAM annotations for better binder mimic sequences
  - PFAM and KOFAM annotations for the original metagenome sequences
- Created metagenome domain visualization in sequence detail page
- Added tabs for viewing both sets of domains in the domain details section

### 2. Sequence Length Tracking
- Added extraction of protein sequence lengths from FASTA files and domain positions
- Added sequence length as a filterable column in the main data table
- Display sequence length statistics in the data summary section
- Display sequence length in amino acids in the sequence detail view

### 3. Interactive Binding Data Analysis
- Added interactive filters for binding data in the sequence detail page:
  - MHC type filter (dynamic options based on data)
  - Binding level filter (SB, WB, NB)
  - Affinity threshold filter (custom numeric input)
  - Peptide length filter (dynamic options)
  - Position range filter (start and end coordinates of mimic peptides)
- Added dynamic visualizations that update with filters:
  - MHC distribution chart showing frequency of each MHC type
  - Peptide length distribution chart showing sequence length patterns
- Added CSV export functionality for filtered binding data
- Added dynamic count indicator showing matches for current filter settings
- Added position coordinates (start and end) in the binding data table for each mimic peptide

### 4. Visualization of All Filtered Data
- Added ability to visualize all filtered data regardless of pagination limits
- Table still maintains the display limit (100 records per page) for better usability
- Users can toggle between "selected rows" and "all filtered data" visualization modes with a prominent button
- Visualization dynamically updates when filters are changed
- Pre-aggregated data on the server side ensures efficient processing of large datasets

### 5. Improved Modal Handling
- Implemented a robust modal system for sequence details
- Each modal instance is freshly created when needed to prevent stale references
- Complete cleanup of previous modals to avoid DOM conflicts
- Added better error handling and recovery for modal interactions

## Recent Updates

### Domain Frequency Comparison in Cancer Epitope Pages

A new feature has been added to the cancer/epitope detail pages that compares the frequency of PFAM domains found in proteins that mimic a particular cancer antigen with the base occurrence frequencies of those domains across all hits in the metagenome.

The implementation includes:

1. **Backend Domain Frequency Analysis**:
   - Added method `get_global_domain_frequencies()` to calculate baseline domain frequencies from all available data
   - Enhanced `get_cancer_data()` to calculate domain enrichment (fold change) for cancer-specific domains
   - Data is organized by comparing fractions of domains in cancer-specific sequences vs. global data

2. **Domain Enrichment Visualization**:
   - Added a new dedicated section in cancer detail page template
   - Implemented an interactive horizontal bar chart showing domain enrichment with:
     - Log scale to better visualize enrichment/depletion
     - Color coding (blue for enriched domains, red for depleted domains)
     - Reference line at 1.0 (equal frequency)
     - Tooltips showing detailed statistics (counts, percentages, fold change)
   - Added "Export as PNG" functionality for all charts

3. **Interactive Features**:
   - Domain enrichment visualization is integrated with filtering thresholds
   - Clicking on domains shows gene associations, similar to other domain visualizations
   - Chart updates dynamically as filters are applied

This feature helps researchers identify which domains are specifically enriched in mimics of a particular cancer antigen, potentially highlighting functional or evolutionary relationships.

## Future Enhancements

Planned improvements:
1. Additional sequence comparison features
2. Enhanced export capabilities for analysis results
3. Sequence alignment views
4. Integration with external protein domain databases
5. Batch analysis of multiple sequences
6. Advanced filtering for metagenome domains
7. Statistical analysis tools for domain and binding associations
8. Additional domain enrichment statistics (p-values and statistical significance)
9. Comparative analysis between different cancer antigens