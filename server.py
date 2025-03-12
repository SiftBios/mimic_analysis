# File: server.py
# Purpose: Web server for the mimic identification pipeline

import os
import json
import argparse
import pandas as pd
from flask import Flask, jsonify, request, render_template, send_from_directory
from werkzeug.utils import secure_filename
from data_processor import MimicDataProcessor

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates')

# Global variables
DATA_DIR = None
PROCESSOR = None
SAMPLE_ID = None

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html', sample_id=SAMPLE_ID)

@app.route('/api/data')
def get_data():
    """API endpoint to get the merged data."""
    if PROCESSOR is None or PROCESSOR.merged_data is None:
        return jsonify({'error': 'Data not loaded'}), 500
    
    try:
        # Get pagination parameters
        page = request.args.get('page', default=0, type=int)
        page_size = request.args.get('page_size', default=100, type=int)
        
        # Get filter parameters
        filters_str = request.args.get('filters', default='{}')
        try:
            filters = json.loads(filters_str)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid filters JSON'}), 400
        
        # Get sorting parameters
        sort_by = request.args.get('sort_by', default=None)
        sort_dir = request.args.get('sort_dir', default='asc')
        
        # Apply filters - with error handling
        try:
            # Create a boolean mask instead of copying the DataFrame
            mask = pd.Series(True, index=PROCESSOR.merged_data.index)
            
            for column, filter_value in filters.items():
                if column not in PROCESSOR.merged_data.columns:
                    continue
                    
                if isinstance(filter_value, dict):
                    # Numeric filter
                    if 'min' in filter_value and filter_value['min'] is not None:
                        mask &= (PROCESSOR.merged_data[column] >= filter_value['min'])
                    if 'max' in filter_value and filter_value['max'] is not None:
                        mask &= (PROCESSOR.merged_data[column] <= filter_value['max'])
                else:
                    # String filter (substring match)
                    mask &= (PROCESSOR.merged_data[column].astype(str).str.contains(str(filter_value), case=False, na=False))
            
            # Apply the mask only once
            filtered_data = PROCESSOR.merged_data[mask]
        except Exception as e:
            print(f"Error applying filters: {e}")
            filtered_data = PROCESSOR.merged_data.head(page_size)  # Fallback to first page_size rows
        
        # Apply sorting - with error handling
        try:
            if sort_by and sort_by in filtered_data.columns:
                ascending = sort_dir.lower() == 'asc'
                filtered_data = filtered_data.sort_values(by=sort_by, ascending=ascending)
        except Exception as e:
            print(f"Error applying sorting: {e}")
        
        # Calculate total after filtering
        total_rows = len(filtered_data)
        
        # Apply pagination - with bounds checking
        start_idx = min(page * page_size, max(0, total_rows - 1))
        end_idx = min(start_idx + page_size, total_rows)
        
        # Handle empty dataframe case
        if total_rows == 0:
            return jsonify({
                'data': [],
                'page': page,
                'page_size': page_size,
                'total_rows': 0,
                'total_pages': 0
            })
            
        try:
            paginated_data = filtered_data.iloc[start_idx:end_idx]
        except Exception as e:
            print(f"Error applying pagination: {e}")
            paginated_data = filtered_data.head(page_size)  # Fallback
        
        # Convert to JSON-compatible format - with sanitization for problematic values
        try:
            # Convert to records and sanitize
            records = paginated_data.replace({
                float('nan'): None,
                float('inf'): None,
                float('-inf'): None
            }).to_dict(orient='records')
            
            # Additional sanitization for domain columns
            for record in records:
                # Process domain columns that should contain JSON strings
                for col in ['PFAM_domains', 'KOFAM_domains']:
                    if col in record:
                        try:
                            if record[col] is None:
                                record[col] = '[]'
                            elif isinstance(record[col], str):
                                # Try to validate JSON
                                json.loads(record[col])
                            else:
                                record[col] = '[]'
                        except:
                            record[col] = '[]'
            
            return jsonify({
                'data': records,
                'page': page,
                'page_size': page_size,
                'total_rows': total_rows,
                'total_pages': max(1, (total_rows + page_size - 1) // page_size)
            })
        except Exception as e:
            import traceback
            print(f"Error preparing JSON response: {e}")
            print(traceback.format_exc())
            
            # Last resort - return minimal valid data
            return jsonify({
                'data': [],
                'page': page,
                'page_size': page_size,
                'total_rows': total_rows,
                'total_pages': 1,
                'error': f"Data formatting error: {str(e)}"
            })
            
    except Exception as e:
        import traceback
        print(f"Unhandled error in get_data: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/visualization_data')
def get_visualization_data():
    """API endpoint to get filtered data summaries for visualization purposes."""
    if PROCESSOR is None or PROCESSOR.merged_data is None:
        return jsonify({'error': 'Data not loaded'}), 500
    
    try:
        # Get filter parameters
        filters_str = request.args.get('filters', default='{}')
        try:
            filters = json.loads(filters_str)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid filters JSON'}), 400
        
        # Apply filters - with error handling
        try:
            # Create a boolean mask instead of copying the DataFrame
            mask = pd.Series(True, index=PROCESSOR.merged_data.index)
            
            for column, filter_value in filters.items():
                if column not in PROCESSOR.merged_data.columns:
                    continue
                    
                if isinstance(filter_value, dict):
                    # Numeric filter
                    if 'min' in filter_value and filter_value['min'] is not None:
                        mask &= (PROCESSOR.merged_data[column] >= filter_value['min'])
                    if 'max' in filter_value and filter_value['max'] is not None:
                        mask &= (PROCESSOR.merged_data[column] <= filter_value['max'])
                else:
                    # String filter (substring match)
                    mask &= (PROCESSOR.merged_data[column].astype(str).str.contains(str(filter_value), case=False, na=False))
            
            # Apply the mask only once
            filtered_data = PROCESSOR.merged_data[mask]
        except Exception as e:
            print(f"Error applying filters for visualization data: {e}")
            return jsonify({'error': f'Error applying filters: {str(e)}'}), 500
        
        # Calculate total after filtering
        total_rows = len(filtered_data)
        
        # Handle empty dataframe case
        if total_rows == 0:
            return jsonify({
                'total_rows': 0,
                'mhc_counts': {},
                'affinity_data': [],
                'pfam_domains': [],
                'kofam_domains': []
            })
        
        # Instead of sending all raw data, pre-compute the summaries needed for each visualization
        try:
            # 1. MHC Distribution - Count by MHC type
            mhc_counts = filtered_data['MHC'].value_counts().to_dict()
            
            # 2. Binding Affinity - Extract only the affinity values needed for histogram
            affinity_data = filtered_data['mimic_Aff(nM)'].dropna().tolist()
            
            # 3. Domain Distribution - Pre-compute domain counts using vectorized operations where possible
            
            # Process PFAM better binders domains
            try:
                # Create a counter for domain names
                from collections import Counter
                pfam_domain_counts = Counter()
                
                # Only process rows that actually have domains
                domains_data = filtered_data['PFAM_domains'].dropna()
                
                # Extract and count domains efficiently
                for domains_json in domains_data:
                    try:
                        domains = json.loads(domains_json)
                        domain_names = [domain['hmm_name'] for domain in domains]
                        pfam_domain_counts.update(domain_names)
                    except:
                        continue
                
                # Convert to list and sort by count - only keep top 15
                pfam_domains = [{'domain': domain, 'count': count} 
                               for domain, count in pfam_domain_counts.most_common(15)]
            except Exception as e:
                print(f"Error processing PFAM domains for visualization: {e}")
                pfam_domains = []
            
            # Process KOFAM better binders domains similarly
            try:
                # Create a counter for domain names
                from collections import Counter
                kofam_domain_counts = Counter()
                
                # Only process rows that actually have domains
                domains_data = filtered_data['KOFAM_domains'].dropna()
                
                # Extract and count domains efficiently
                for domains_json in domains_data:
                    try:
                        domains = json.loads(domains_json)
                        domain_names = [domain['hmm_name'] for domain in domains]
                        kofam_domain_counts.update(domain_names)
                    except:
                        continue
                
                # Convert to list and sort by count - only keep top 15
                kofam_domains = [{'domain': domain, 'count': count} 
                               for domain, count in kofam_domain_counts.most_common(15)]
            except Exception as e:
                print(f"Error processing KOFAM domains for visualization: {e}")
                kofam_domains = []
            
            # Initialize metagenome domain variables
            pfam_metagenome_domains = []
            kofam_metagenome_domains = []
            
            # Process PFAM metagenome domains if available
            if 'PFAM_metagenome_domains' in filtered_data.columns:
                try:
                    # Create a counter for domain names
                    from collections import Counter
                    pfam_meta_domain_counts = Counter()
                    
                    # Only process rows that actually have domains
                    domains_data = filtered_data['PFAM_metagenome_domains'].dropna()
                    
                    # Extract and count domains efficiently
                    for domains_json in domains_data:
                        try:
                            domains = json.loads(domains_json)
                            domain_names = [domain['hmm_name'] for domain in domains]
                            pfam_meta_domain_counts.update(domain_names)
                        except:
                            continue
                    
                    # Convert to list and sort by count - only keep top 15
                    pfam_metagenome_domains = [{'domain': domain, 'count': count} 
                                   for domain, count in pfam_meta_domain_counts.most_common(15)]
                except Exception as e:
                    print(f"Error processing PFAM metagenome domains for visualization: {e}")
                    pfam_metagenome_domains = []
            
            # Process KOFAM metagenome domains if available
            if 'KOFAM_metagenome_domains' in filtered_data.columns:
                try:
                    # Create a counter for domain names
                    from collections import Counter
                    kofam_meta_domain_counts = Counter()
                    
                    # Only process rows that actually have domains
                    domains_data = filtered_data['KOFAM_metagenome_domains'].dropna()
                    
                    # Extract and count domains efficiently
                    for domains_json in domains_data:
                        try:
                            domains = json.loads(domains_json)
                            domain_names = [domain['hmm_name'] for domain in domains]
                            kofam_meta_domain_counts.update(domain_names)
                        except:
                            continue
                    
                    # Convert to list and sort by count - only keep top 15
                    kofam_metagenome_domains = [{'domain': domain, 'count': count} 
                                   for domain, count in kofam_meta_domain_counts.most_common(15)]
                except Exception as e:
                    print(f"Error processing KOFAM metagenome domains for visualization: {e}")
                    kofam_metagenome_domains = []
            
            return jsonify({
                'total_rows': total_rows,
                'mhc_counts': mhc_counts,
                'affinity_data': affinity_data,
                'pfam_domains': pfam_domains,
                'kofam_domains': kofam_domains,
                'pfam_metagenome_domains': pfam_metagenome_domains,
                'kofam_metagenome_domains': kofam_metagenome_domains
            })
        except Exception as e:
            import traceback
            print(f"Error preparing visualization data summaries: {e}")
            print(traceback.format_exc())
            return jsonify({'error': f'Error preparing data: {str(e)}'}), 500
            
    except Exception as e:
        import traceback
        print(f"Unhandled error in get_visualization_data: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
                
@app.route('/api/metadata')
def get_metadata():
    """API endpoint to get column metadata for the UI."""
    if PROCESSOR is None:
        return jsonify({'error': 'Data not loaded'}), 500
        
    try:
        metadata = PROCESSOR.get_column_metadata()
        return jsonify(metadata)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/summary')
def get_summary():
    """API endpoint to get a summary of the data."""
    if PROCESSOR is None:
        return jsonify({'error': 'Data not loaded'}), 500
        
    try:
        # Add detailed error catching
        try:
            summary = PROCESSOR.get_data_summary()
            return jsonify(summary)
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"Error in get_data_summary: {e}")
            print(error_details)
            return jsonify({'error': str(e), 'details': error_details}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static/img'),
                               'favicon.svg', mimetype='image/svg+xml')

@app.route('/domain_enrichment_analysis.md')
def domain_enrichment_doc():
    """Serve the domain enrichment analysis documentation."""
    return send_from_directory(app.root_path, 'domain_enrichment_analysis.md', 
                              mimetype='text/markdown')

@app.route('/domain_enrichment')
def domain_enrichment():
    """Render the domain enrichment analysis page."""
    if PROCESSOR is None:
        return render_template('error.html', 
                              error_title="Server Error",
                              error_message="Data not loaded.",
                              error_details="Please restart the server."), 500
    
    try:
        # Get domain enrichment data from processor
        enrichment_data = PROCESSOR.get_domain_enrichment_data()
        
        # Set default threshold values 
        default_thresholds = {
            'bitscore': 30.0,  # Default minimum bitscore to include a domain
            'evalue': 0.001,   # Default maximum e-value to include a domain
            'count': 1,        # Default minimum count to include a domain
            'enrichment': 1.0, # Default minimum enrichment value (fold change)
            'affinity': 500.0, # Default affinity threshold for binding domains
            'bind_level': None # Default binding level filter (None = all levels)
        }
        
        # Don't run binding domain analysis on initial page load
        binding_domains_data = {
            "domain_summaries": [],
            "total_sequences": 0,
            "binding_threshold": default_thresholds['affinity'],
            "binding_level": default_thresholds['bind_level']
        }
        
        # Render the template with all data
        return render_template('domain_enrichment.html', 
                              sample_id=SAMPLE_ID,
                              pfam_enrichment=enrichment_data['pfam_enrichment'],
                              kofam_enrichment=enrichment_data['kofam_enrichment'],
                              pfam_domains=enrichment_data['pfam_domains'],
                              kofam_domains=enrichment_data['kofam_domains'],
                              pfam_depletion=enrichment_data['pfam_depletion'],
                              kofam_depletion=enrichment_data['kofam_depletion'],
                              pfam_exclusive=enrichment_data['pfam_exclusive'],
                              kofam_exclusive=enrichment_data['kofam_exclusive'],
                              all_enrichment_data=enrichment_data['all_enrichment_data'],
                              statistics=enrichment_data['statistics'],
                              binding_domains_data=binding_domains_data,
                              thresholds=default_thresholds)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"ERROR loading domain enrichment page: {e}")
        print(error_details)
        
        return render_template('error.html', 
                              error_title="Error Loading Domain Enrichment",
                              error_message="An error occurred while loading domain enrichment data.",
                              error_details=str(e)), 500

@app.route('/api/binding_domains')
def get_binding_domains():
    """API endpoint to get domains containing binding peptides with filters."""
    if PROCESSOR is None:
        return jsonify({'error': 'Data not loaded'}), 500
    
    try:
        # Get filter parameters
        binding_threshold = request.args.get('binding_threshold', default=500, type=float)
        binding_level = request.args.get('binding_level', default=None)
        max_sequences = request.args.get('max_sequences', default=None, type=int)
        
        # Convert empty string to None
        if binding_level == "":
            binding_level = None
            
        # Get binding domains data with filters - no progress callback for API endpoint
        binding_domains_data = PROCESSOR.analyze_binding_domain_intersections(
            binding_affinity_threshold=binding_threshold,
            binding_level=binding_level,
            max_sequences=max_sequences
        )
        
        return jsonify(binding_domains_data)
    except Exception as e:
        import traceback
        print(f"Error in get_binding_domains: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# WebSocket route for binding domain analysis with progress updates
@app.route('/api/binding_domains_progress', methods=['POST'])
def binding_domains_progress():
    """Start binding domain analysis with progress tracking."""
    if PROCESSOR is None:
        return jsonify({'error': 'Data not loaded'}), 500
    
    try:
        # Get parameters from JSON request
        data = request.get_json()
        binding_threshold = data.get('binding_threshold', 500)
        binding_level = data.get('binding_level', None)
        max_sequences = data.get('max_sequences', 1000)  # Limit to 1000 sequences by default
        session_id = data.get('session_id', '')
        
        # Generate a unique task ID
        import uuid
        task_id = str(uuid.uuid4())
        
        # Store task info in a global tasks dictionary (in-memory storage)
        global_tasks[task_id] = {
            'progress': 0,
            'status': 'running',
            'result': None,
            'session_id': session_id
        }
        
        # Define progress callback function
        def update_progress(progress):
            global_tasks[task_id]['progress'] = progress
            
        # Run analysis in a separate thread to avoid blocking
        import threading
        def run_analysis():
            try:
                result = PROCESSOR.analyze_binding_domain_intersections(
                    binding_affinity_threshold=binding_threshold,
                    binding_level=binding_level,
                    max_sequences=max_sequences,
                    progress_callback=update_progress
                )
                global_tasks[task_id]['result'] = result
                global_tasks[task_id]['status'] = 'completed'
            except Exception as e:
                import traceback
                print(f"Error in analysis thread: {e}")
                print(traceback.format_exc())
                global_tasks[task_id]['status'] = 'error'
                global_tasks[task_id]['error'] = str(e)
                
        # Start the analysis thread
        threading.Thread(target=run_analysis).start()
        
        # Return task ID for client to poll progress
        return jsonify({'task_id': task_id})
        
    except Exception as e:
        import traceback
        print(f"Error starting binding domains analysis: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# In-memory storage for tasks
global_tasks = {}

@app.route('/api/binding_domains_status/<task_id>')
def binding_domains_status(task_id):
    """Check status of a binding domain analysis task."""
    if task_id not in global_tasks:
        return jsonify({'error': 'Task not found'}), 404
        
    task = global_tasks[task_id]
    
    # Build response based on task status
    response = {
        'status': task['status'],
        'progress': task['progress']
    }
    
    # If task completed, include the result and clean up
    if task['status'] == 'completed':
        response['result'] = task['result']
        
        # Cleanup task after 5 minutes to prevent memory leaks
        # In a production application, you would use a proper task queue and results backend
        import threading
        def cleanup_task():
            import time
            time.sleep(300)  # Wait 5 minutes
            if task_id in global_tasks:
                del global_tasks[task_id]
                
        threading.Thread(target=cleanup_task).start()
        
    # If task errored, include error message
    elif task['status'] == 'error':
        response['error'] = task.get('error', 'Unknown error')
        
    return jsonify(response)


@app.errorhandler(500)
def server_error(e):
    return render_template('error.html', 
                          error_title="Server Error",
                          error_message="An internal server error occurred.",
                          error_details=str(e)), 500
                          
@app.route('/api/domains/<sequence_id>')
def get_domains(sequence_id):
    """API endpoint to get detailed domain information for a sequence."""
    if PROCESSOR is None:
        return jsonify({'error': 'Data not loaded'}), 500
    
    if not hasattr(PROCESSOR, 'pfam_map') or not hasattr(PROCESSOR, 'kofam_map'):
        return jsonify({'error': 'Domain data not processed'}), 500
    
    # Get better binders domain info
    pfam_domains = PROCESSOR.pfam_map.get(sequence_id, [])
    kofam_domains = PROCESSOR.kofam_map.get(sequence_id, [])
    
    # Get metagenome domain info if available
    pfam_metagenome_domains = []
    if hasattr(PROCESSOR, 'pfam_metagenome_map'):
        pfam_metagenome_domains = PROCESSOR.pfam_metagenome_map.get(sequence_id, [])
    
    kofam_metagenome_domains = []
    if hasattr(PROCESSOR, 'kofam_metagenome_map'):
        kofam_metagenome_domains = PROCESSOR.kofam_metagenome_map.get(sequence_id, [])
    
    return jsonify({
        'sequence_id': sequence_id,
        'pfam_domains': pfam_domains,
        'kofam_domains': kofam_domains,
        'pfam_metagenome_domains': pfam_metagenome_domains,
        'kofam_metagenome_domains': kofam_metagenome_domains
    })

@app.route('/cancer/<cancer_acc>')
def cancer_detail(cancer_acc):
    """Render the cancer accession detail page."""
    if PROCESSOR is None:
        return render_template('error.html', 
                              error_title="Server Error",
                              error_message="Data not loaded.",
                              error_details="Please restart the server."), 500
    
    # Get comprehensive cancer data
    try:
        print(f"DEBUG: Loading cancer detail for {cancer_acc}")
        cancer_data = PROCESSOR.get_cancer_data(cancer_acc)
        
        if cancer_data is None:
            return render_template('error.html', 
                                  error_title="Cancer Accession Not Found",
                                  error_message=f"Cancer accession {cancer_acc} was not found in the dataset.",
                                  error_details="Please check the cancer accession and try again."), 404
        
        # DEBUG: Print information about the pfam_enrichment data
        print(f"DEBUG: Got cancer data for {cancer_acc}, preparing to render template")
        print(f"DEBUG: pfam_enrichment data type: {type(cancer_data.get('pfam_enrichment'))}")
        print(f"DEBUG: pfam_enrichment length: {len(cancer_data.get('pfam_enrichment', []))}")
        if len(cancer_data.get('pfam_enrichment', [])) > 0:
            first_item = cancer_data['pfam_enrichment'][0]
            print(f"DEBUG: First pfam_enrichment item: {first_item}")
        else:
            print(f"DEBUG: pfam_enrichment is empty")
        
        # Set default threshold values 
        default_thresholds = {
            'bitscore': 30.0,  # Default minimum bitscore to include a domain
            'evalue': 0.001,   # Default maximum e-value to include a domain
            'count': 1,        # Default minimum count to include a domain
            'binding': 500.0   # Default binding affinity threshold (nM)
        }
        
        # Render the template with all data
        try:
            return render_template('cancer_detail.html', 
                                  sample_id=SAMPLE_ID,
                                  cancer_acc=cancer_acc,
                                  basic_info=cancer_data['basic_info'],
                                  mimic_genes=cancer_data['mimic_genes'],
                                  mhc_alleles=cancer_data['mhc_alleles'],
                                  pfam_domains=cancer_data['pfam_domains'],
                                  kofam_domains=cancer_data['kofam_domains'],
                                  pfam_enrichment=cancer_data['pfam_enrichment'],
                                  binding_data=cancer_data['binding_data'],
                                  affinity_stats=cancer_data['affinity_stats'],
                                  binding_levels=cancer_data['binding_levels'],
                                  raw_data=cancer_data['raw_data'],
                                  thresholds=default_thresholds)
        except Exception as template_error:
            import traceback
            print(f"ERROR rendering template for cancer {cancer_acc}: {template_error}")
            print(traceback.format_exc())
            
            return render_template('error.html', 
                                  error_title="Template Error",
                                  error_message=f"An error occurred while rendering the template for cancer {cancer_acc}.",
                                  error_details=str(template_error)), 500
                              
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"ERROR loading cancer {cancer_acc}: {e}")
        print(error_details)
        
        return render_template('error.html', 
                              error_title="Error Loading Cancer Accession",
                              error_message=f"An error occurred while loading cancer accession {cancer_acc}.",
                              error_details=str(e)), 500

@app.route('/sequence/<sequence_id>')
def sequence_detail(sequence_id):
    """Render the sequence detail page."""
    if PROCESSOR is None:
        return render_template('error.html', 
                              error_title="Server Error",
                              error_message="Data not loaded.",
                              error_details="Please restart the server."), 500
    
    # Get comprehensive sequence data
    try:
        print(f"DEBUG: Loading sequence detail for {sequence_id}")
        sequence_data = PROCESSOR.get_sequence_data(sequence_id)
        
        if sequence_data is None:
            return render_template('error.html', 
                                  error_title="Sequence Not Found",
                                  error_message=f"Sequence {sequence_id} was not found in the dataset.",
                                  error_details="Please check the sequence ID and try again."), 404
        
        print(f"DEBUG: Got sequence data for {sequence_id}, fetching related sequences")
        
        # Get related sequences with exception handling
        try:
            related_sequences = PROCESSOR.find_related_sequences(sequence_id)
        except Exception as related_error:
            print(f"ERROR finding related sequences for {sequence_id}: {related_error}")
            import traceback
            print(traceback.format_exc())
            # Continue without related sequences if they fail
            related_sequences = []
        
        print(f"DEBUG: Preparing to render template for {sequence_id}")
        
        # Ensure all required keys exist and are of proper type
        if 'pfam_domains' not in sequence_data or not isinstance(sequence_data['pfam_domains'], list):
            print(f"WARNING: pfam_domains missing or not a list for {sequence_id}, using empty list")
            sequence_data['pfam_domains'] = []
            
        if 'kofam_domains' not in sequence_data or not isinstance(sequence_data['kofam_domains'], list):
            print(f"WARNING: kofam_domains missing or not a list for {sequence_id}, using empty list")
            sequence_data['kofam_domains'] = []
            
        if 'binding_data' not in sequence_data or not isinstance(sequence_data['binding_data'], list):
            print(f"WARNING: binding_data missing or not a list for {sequence_id}, using empty list")
            sequence_data['binding_data'] = []
            
        if 'binding_positions' not in sequence_data or not isinstance(sequence_data['binding_positions'], list):
            print(f"WARNING: binding_positions missing or not a list for {sequence_id}, using empty list")
            sequence_data['binding_positions'] = []
            
        if 'sequence' not in sequence_data:
            print(f"WARNING: sequence missing for {sequence_id}, using empty string")
            sequence_data['sequence'] = ""
            
        if 'raw_data' not in sequence_data or not isinstance(sequence_data['raw_data'], dict):
            print(f"WARNING: raw_data missing or not a dict for {sequence_id}, using empty dict")
            sequence_data['raw_data'] = {}
        
        # Ensure basic_info exists and is a dict
        if 'basic_info' not in sequence_data or not isinstance(sequence_data['basic_info'], dict):
            print(f"WARNING: basic_info missing or not a dict for {sequence_id}, creating default")
            sequence_data['basic_info'] = {
                'Mimic Gene': sequence_id,
                'Cancer Gene': 'N/A',
                'Cancer DB': 'N/A',
                'PFAM Domains': 0,
                'KOFAM Domains': 0,
                'MHC Binding Sites': 0
            }
        
        # Debug the data being sent to the template
        print(f"DEBUG: Rendering template with: pfam_domains={len(sequence_data['pfam_domains'])}, "
              f"kofam_domains={len(sequence_data['kofam_domains'])}, "
              f"binding_data={len(sequence_data['binding_data'])} items, "
              f"binding_positions={len(sequence_data['binding_positions'])} items, "
              f"related_sequences={len(related_sequences)} items")
                
        try:
            # Render the template with all data
            return render_template('sequence_detail.html', 
                                sample_id=SAMPLE_ID,
                                sequence_id=sequence_id,
                                basic_info=sequence_data['basic_info'],
                                pfam_domains=sequence_data['pfam_domains'],
                                kofam_domains=sequence_data['kofam_domains'],
                                pfam_metagenome_domains=sequence_data.get('pfam_metagenome_domains', []),
                                kofam_metagenome_domains=sequence_data.get('kofam_metagenome_domains', []),
                                binding_data=sequence_data['binding_data'],
                                binding_positions=sequence_data.get('binding_positions', []),
                                sequence=sequence_data['sequence'],
                                raw_data=sequence_data['raw_data'],
                                related_sequences=related_sequences)
        except Exception as template_error:
            import traceback
            print(f"ERROR rendering template for {sequence_id}: {template_error}")
            print(traceback.format_exc())
            
            return render_template('error.html', 
                                error_title="Template Error",
                                error_message=f"An error occurred while rendering the template for {sequence_id}.",
                                error_details=str(template_error)), 500
                              
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"ERROR loading sequence {sequence_id}: {e}")
        print(error_details)
        
        return render_template('error.html', 
                              error_title="Error Loading Sequence",
                              error_message=f"An error occurred while loading sequence {sequence_id}.",
                              error_details=str(e)), 500

def load_data(data_dir):
    """Load and process data."""
    global PROCESSOR, SAMPLE_ID
    
    try:
        PROCESSOR = MimicDataProcessor(data_dir)
        PROCESSOR.load_data()
        SAMPLE_ID = PROCESSOR.sample_id
        PROCESSOR.process_hmm_hits()
        PROCESSOR.merge_data()
        return True
    except Exception as e:
        print(f"Error loading data: {e}")
        return False

def main():
    """Main entry point."""
    global DATA_DIR
    
    parser = argparse.ArgumentParser(description='Start the mimic identification pipeline server')
    parser.add_argument('data_dir', help='Directory containing the input data files')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind the server to')
    parser.add_argument('--port', type=int, default=5000, help='Port to bind the server to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    
    args = parser.parse_args()
    DATA_DIR = args.data_dir
    
    # Load data
    print(f"Loading data from {DATA_DIR}...")
    success = load_data(DATA_DIR)
    
    if not success:
        print("Failed to load data. Exiting.")
        exit(1)
    
    print(f"Starting server on {args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=args.debug)

if __name__ == "__main__":
    main()
