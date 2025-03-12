# Mimic Identification Pipeline

An interactive web application for analyzing and visualizing protein sequence data from a mimic identification pipeline.

## Overview

This application provides an interactive interface to explore relationships between protein sequences, their HMM domain annotations (from PFAM and KOFAM), and MHC-I binding affinity results.

## Features

- **Interactive Data Table**
  - Display merged data from CSV files with HMM annotations
  - Filter by substring search for text columns
  - Filter by numerical thresholds for numeric columns
  - Sort by any column
  - Select rows for detailed analysis

- **Data Visualization**
  - MHC distribution analysis
  - Binding affinity distribution
  - Domain distribution and analysis
  - Interactive charts

- **Sequence Detail Pages**
  - Dedicated analysis page for individual sequences
  - Domain visualization
  - Binding data

## Setup and Installation

### Prerequisites

- Python 3.8+
- Flask
- Pandas
- NumPy

### Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/mimic-pipeline.git
   cd mimic-pipeline
   ```

2. Install dependencies
   ```
   pip install -r requirements.txt
   ```

3. Run the application
   ```
   python server.py /path/to/data/directory
   ```

4. Open a web browser and navigate to `http://127.0.0.1:5000`

## Input Data

The application expects the following files in the input directory:

- `*_merged_better_binders.csv`: Main data file with MHC binding information
- `*_PFAM_hits.tsv`: PFAM domain annotations
- `*_KOFAM_hits.tsv`: KOFAM domain annotations
- `*.faa`: FASTA files with protein sequences

## Project Structure

```
/mimic-pipeline/
├── README.md                     # Project documentation
├── server.py                     # Main Python server script
├── data_processor.py             # Data processing module
├── static/                       # Frontend static files
│   ├── css/
│   │   └── styles.css            # CSS styles
│   ├── js/
│   │   ├── main.js               # Main JavaScript application
│   │   ├── table.js              # Interactive table functionality
│   │   ├── filters.js            # Filter implementation
│   │   └── visualizations.js     # Data visualization scripts
│   └── img/
│       └── favicon.png           # Favicon
├── templates/                    # HTML templates
│   ├── index.html                # Main page template
│   ├── sequence_detail.html      # Sequence detail page
│   └── error.html                # Error page
└── utils/                        # Utility functions (future)
    ├── hmm_utils.py              # HMM processing utilities
    ├── csv_utils.py              # CSV handling utilities
    └── visualization_utils.py    # Visualization helper functions
```

## Future Enhancements

- Advanced protein sequence analysis
- Integration with external protein domain databases
- Batch processing capabilities
- Export capabilities for analysis results
- Additional visualization options

## License

[MIT License](LICENSE)
