# File: data_processor.py
# Purpose: Process and merge data from mimic identification pipeline

import os
import pandas as pd
import numpy as np
import json
from collections import defaultdict
import math
import functools
import re
import time
import mmap
import io
import tracemalloc
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple, Set, Optional, Union, Any

try:
    import polars as pl
    HAS_POLARS = True
except ImportError:
    HAS_POLARS = False

class SequenceCache:
    """
    Efficient cache for FASTA sequences using memory mapping and indexing.
    
    This class pre-loads sequence IDs and their file positions for fast access
    while keeping memory usage low by using memory-mapped files.
    """
    
    def __init__(self, data_dir: str):
        """
        Initialize the sequence cache.
        
        Args:
            data_dir (str): Directory containing FASTA files
        """
        self.data_dir = data_dir
        self.sequence_index: Dict[str, Tuple[str, int, int]] = {}  # seq_id -> (filename, start_pos, length)
        self.mmapped_files: Dict[str, mmap.mmap] = {}
        self.sequence_lengths: Dict[str, int] = {}
        
        # Initialize the cache
        self._index_fasta_files()
        
    def _index_fasta_files(self):
        """Index all FASTA files to create a fast lookup table."""
        start_time = time.time()
        print("Indexing FASTA files...")
        
        fasta_files = [f for f in os.listdir(self.data_dir) 
                      if f.endswith('.faa') or f.endswith('.fasta')]
        
        if not fasta_files:
            print("No FASTA files found in data directory")
            return
            
        # Use ThreadPoolExecutor to index files in parallel
        with ThreadPoolExecutor(max_workers=os.cpu_count()) as executor:
            # Submit indexing tasks for each file
            futures = {executor.submit(self._index_single_file, os.path.join(self.data_dir, f)): f 
                      for f in fasta_files}
            
            # Process results as they complete
            for future in futures:
                filename = futures[future]
                try:
                    file_sequences = future.result()
                    # Merge the results into our main index
                    for seq_id, (start_pos, length) in file_sequences.items():
                        self.sequence_index[seq_id] = (filename, start_pos, length)
                        self.sequence_lengths[seq_id] = length
                except Exception as e:
                    print(f"Error indexing {filename}: {e}")
        
        print(f"Indexed {len(self.sequence_index)} sequences from {len(fasta_files)} files "
              f"in {time.time() - start_time:.2f} seconds")
            
    @staticmethod
    def _index_single_file(file_path: str) -> Dict[str, Tuple[int, int]]:
        """
        Index a single FASTA file.
        
        Args:
            file_path: Path to the FASTA file
            
        Returns:
            Dictionary mapping sequence IDs to (start_position, sequence_length)
        """
        sequences = {}
        
        try:
            with open(file_path, 'r') as f:
                current_id = None
                start_pos = None
                sequence_length = 0
                
                # Scan through the file line by line
                pos = 0
                for line in f:
                    line_length = len(line)
                    
                    if line.startswith('>'):
                        # If we were tracking a sequence, save its info
                        if current_id is not None and start_pos is not None:
                            sequences[current_id] = (start_pos, sequence_length)
                            
                        # Parse new sequence ID
                        header_parts = line[1:].split()
                        current_id = header_parts[0] if header_parts else None
                        start_pos = pos + line_length  # Start after the header line
                        sequence_length = 0
                    elif current_id is not None:
                        # Add to the current sequence length (only count sequence characters)
                        sequence_length += len(line.strip())
                        
                    pos += line_length
                    
                # Add the last sequence if there was one
                if current_id is not None and start_pos is not None:
                    sequences[current_id] = (start_pos, sequence_length)
                    
        except Exception as e:
            print(f"Error indexing file {file_path}: {e}")
            
        return sequences
    
    def _ensure_file_mapped(self, filename: str):
        """Ensure the specified file is memory-mapped."""
        if filename not in self.mmapped_files:
            try:
                filepath = os.path.join(self.data_dir, filename)
                with open(filepath, 'r+b') as f:
                    # Memory map the file for efficient random access
                    self.mmapped_files[filename] = mmap.mmap(
                        f.fileno(), 0, access=mmap.ACCESS_READ
                    )
            except Exception as e:
                print(f"Error memory-mapping file {filename}: {e}")
                return False
        return True
    
    def get_sequence(self, sequence_id: str) -> str:
        """
        Get a sequence by ID using memory-mapped files for efficiency.
        
        Args:
            sequence_id: The ID of the sequence to retrieve
            
        Returns:
            The sequence string, or empty string if not found
        """
        if sequence_id not in self.sequence_index:
            return ""
            
        filename, start_pos, length = self.sequence_index[sequence_id]
        
        # Ensure the file is memory-mapped
        if not self._ensure_file_mapped(filename):
            return ""
            
        try:
            # Read from the memory-mapped file
            mm = self.mmapped_files[filename]
            
            # Position at the start of the sequence data
            mm.seek(start_pos)
            
            # Read bytes that should contain the sequence (plus some extra for newlines)
            # We read more than needed to account for newlines that we'll filter out
            read_length = length + (length // 60) + 10  # Approximate extra space for newlines
            data = mm.read(read_length)
            
            # Convert bytes to string and clean up
            sequence_text = data.decode('utf-8', errors='ignore')
            
            # Extract sequence content (remove newlines)
            sequence = ''.join(line.strip() for line in sequence_text.split('\n'))
            
            # Truncate to the expected length and remove any stop codon
            sequence = sequence[:length]
            if sequence.endswith('*'):
                sequence = sequence[:-1]
                
            return sequence
            
        except Exception as e:
            print(f"Error retrieving sequence {sequence_id}: {e}")
            return ""
    
    def get_sequence_length(self, sequence_id: str) -> int:
        """Get the length of a sequence without loading the full sequence."""
        return self.sequence_lengths.get(sequence_id, 0)
    
    def get_sequences_batch(self, sequence_ids: List[str]) -> Dict[str, str]:
        """
        Efficiently retrieve multiple sequences in one batch operation.
        
        Args:
            sequence_ids: List of sequence IDs to retrieve
            
        Returns:
            Dictionary mapping sequence IDs to their sequences
        """
        result = {}
        
        # Group sequences by file to minimize file operations
        sequences_by_file = defaultdict(list)
        for seq_id in sequence_ids:
            if seq_id in self.sequence_index:
                filename, _, _ = self.sequence_index[seq_id]
                sequences_by_file[filename].append(seq_id)
        
        # Process each file
        for filename, file_sequences in sequences_by_file.items():
            # Ensure the file is memory-mapped
            if not self._ensure_file_mapped(filename):
                continue
                
            # Get all sequences from this file
            for seq_id in file_sequences:
                result[seq_id] = self.get_sequence(seq_id)
                
        return result
    
    def close(self):
        """Close all memory-mapped files."""
        for mm in self.mmapped_files.values():
            mm.close()
        self.mmapped_files.clear()

class MimicDataProcessor:
    """
    Process and merge data from the mimic identification pipeline:
    - merged_better_binders.csv (main data)
    - PFAM_hits.tsv (PFAM HMM annotations)
    - KOFAM_hits.tsv (KOFAM HMM annotations)
    """
    
    def __init__(self, data_dir):
        """
        Initialize the data processor with the directory containing input files.
        
        Args:
            data_dir (str): Path to directory containing input files
        """
        self.data_dir = data_dir
        self.binders_data = None
        self.pfam_binders_data = None
        self.kofam_binders_data = None
        self.pfam_metagenome_data = None
        self.kofam_metagenome_data = None
        self.metagenome_sequence_lengths = {}  # Dictionary to store sequence lengths
        self.merged_data = None
        
        # Create a sequence cache for efficient FASTA file access
        print("Initializing sequence cache...")
        self.sequence_cache = SequenceCache(data_dir)
        
    def load_data(self):
        """Load all data files from the specified directory."""
        # Find the merged_better_binders.csv file (might have a prefix)
        binders_file = None
        for filename in os.listdir(self.data_dir):
            if filename.endswith("_merged_better_binders.csv"):
                binders_file = filename
                break
                
        if not binders_file:
            raise FileNotFoundError("Could not find merged_better_binders.csv file")
            
        # Extract sample ID from filename
        self.sample_id = binders_file.split('_merged_better_binders.csv')[0]
        
        # Load sequence lengths from FASTA files if available
        self._load_sequence_lengths_from_fasta()
        
        # Load main binders data with optimized settings
        binders_path = os.path.join(self.data_dir, binders_file)
        # First read the column names to determine which ones we need
        with open(binders_path, 'r') as f:
            header = f.readline().strip().split(',')
        
        # Define essential columns to load - add more if needed for your application
        essential_columns = [
            'mimic_gene', 'MHC', 'cancer_acc', 'cancer_DB', 'mimic_Peptide',
            'mimic_Score_EL', 'mimic_%Rank_EL', 'mimic_Aff(nM)', 'mimic_BindLevel'
        ]
        
        # Find which essential columns exist in the file
        usecols = [col for col in essential_columns if col in header]
        
        # Load only essential columns and with optimized performance settings
        self.binders_data = pd.read_csv(
            binders_path,
            usecols=usecols,
            low_memory=False,  # Prevents mixed type warnings
            dtype={
                'mimic_gene': str,
                'MHC': str,
                'cancer_acc': str,
                'cancer_DB': str,
                'mimic_Peptide': str,
                'mimic_BindLevel': str
            }
        )
        
        # Load PFAM better binders hits
        pfam_binders_path = os.path.join(self.data_dir, f"{self.sample_id}_PFAM_better_binders.tsv")
        if os.path.exists(pfam_binders_path):
            self.pfam_binders_data = pd.read_csv(
                pfam_binders_path, 
                sep='\t',
                dtype={
                    'sequence_id': str,
                    'hmm_name': str
                }
            )
            print(f"PFAM better binders hits: {len(self.pfam_binders_data)} rows")
        else:
            # Try the older naming convention as fallback
            pfam_binders_path = os.path.join(self.data_dir, f"{self.sample_id}_PFAM_hits.tsv")
            if os.path.exists(pfam_binders_path):
                self.pfam_binders_data = pd.read_csv(
                    pfam_binders_path, 
                    sep='\t',
                    dtype={
                        'sequence_id': str,
                        'hmm_name': str
                    }
                )
                print(f"PFAM hits (legacy format): {len(self.pfam_binders_data)} rows")
            else:
                print(f"WARNING: No PFAM better binders file found for {self.sample_id}")
                self.pfam_binders_data = pd.DataFrame(columns=['sequence_id', 'hmm_name', 'bitscore', 'evalue', 'env_from', 'env_to'])
        
        # Load KOFAM better binders hits
        kofam_binders_path = os.path.join(self.data_dir, f"{self.sample_id}_KOFAM_better_binders.tsv")
        if os.path.exists(kofam_binders_path):
            self.kofam_binders_data = pd.read_csv(
                kofam_binders_path, 
                sep='\t',
                dtype={
                    'sequence_id': str,
                    'hmm_name': str
                }
            )
            print(f"KOFAM better binders hits: {len(self.kofam_binders_data)} rows")
        else:
            # Try the older naming convention as fallback
            kofam_binders_path = os.path.join(self.data_dir, f"{self.sample_id}_KOFAM_hits.tsv")
            if os.path.exists(kofam_binders_path):
                self.kofam_binders_data = pd.read_csv(
                    kofam_binders_path, 
                    sep='\t',
                    dtype={
                        'sequence_id': str,
                        'hmm_name': str
                    }
                )
                print(f"KOFAM hits (legacy format): {len(self.kofam_binders_data)} rows")
            else:
                print(f"WARNING: No KOFAM better binders file found for {self.sample_id}")
                self.kofam_binders_data = pd.DataFrame(columns=['sequence_id', 'hmm_name', 'bitscore', 'evalue', 'env_from', 'env_to'])
        
        # Load PFAM metagenome hits (optional)
        pfam_metagenome_path = os.path.join(self.data_dir, f"{self.sample_id}_PFAM_metagenome.tsv")
        if os.path.exists(pfam_metagenome_path):
            self.pfam_metagenome_data = pd.read_csv(
                pfam_metagenome_path, 
                sep='\t',
                dtype={
                    'sequence_id': str,
                    'hmm_name': str
                }
            )
            print(f"PFAM metagenome hits: {len(self.pfam_metagenome_data)} rows")
        else:
            print(f"INFO: No PFAM metagenome file found for {self.sample_id}")
            self.pfam_metagenome_data = pd.DataFrame(columns=['sequence_id', 'hmm_name', 'bitscore', 'evalue', 'env_from', 'env_to'])
        
        # Load KOFAM metagenome hits (optional)
        kofam_metagenome_path = os.path.join(self.data_dir, f"{self.sample_id}_KOFAM_metagenome.tsv")
        if os.path.exists(kofam_metagenome_path):
            self.kofam_metagenome_data = pd.read_csv(
                kofam_metagenome_path, 
                sep='\t',
                dtype={
                    'sequence_id': str,
                    'hmm_name': str
                }
            )
            print(f"KOFAM metagenome hits: {len(self.kofam_metagenome_data)} rows")
        else:
            print(f"INFO: No KOFAM metagenome file found for {self.sample_id}")
            self.kofam_metagenome_data = pd.DataFrame(columns=['sequence_id', 'hmm_name', 'bitscore', 'evalue', 'env_from', 'env_to'])
        
        print(f"Loaded data from {self.data_dir}")
        print(f"Binders data: {len(self.binders_data)} rows")
        
        return self
    
    def process_hmm_hits(self):
        """Process HMM hits to create mappings from sequence to domains."""
        # Process PFAM better binders hits
        pfam_map = defaultdict(list)
        self._process_hmm_data(self.pfam_binders_data, pfam_map, "PFAM better binders")
        
        # Process KOFAM better binders hits
        kofam_map = defaultdict(list)
        self._process_hmm_data(self.kofam_binders_data, kofam_map, "KOFAM better binders")
        
        # Process PFAM metagenome hits (if they exist)
        pfam_metagenome_map = defaultdict(list)
        if self.pfam_metagenome_data is not None and len(self.pfam_metagenome_data) > 0:
            self._process_hmm_data(self.pfam_metagenome_data, pfam_metagenome_map, "PFAM metagenome")
        
        # Process KOFAM metagenome hits (if they exist)
        kofam_metagenome_map = defaultdict(list)
        if self.kofam_metagenome_data is not None and len(self.kofam_metagenome_data) > 0:
            self._process_hmm_data(self.kofam_metagenome_data, kofam_metagenome_map, "KOFAM metagenome")
        
        # Check for any mimic_gene IDs in the binders data that don't have domain entries
        # and explicitly add empty lists for them to prevent potential lookup issues
        if self.binders_data is not None:
            for gene_id in self.binders_data['mimic_gene'].unique():
                str_gene_id = str(gene_id)
                if str_gene_id not in pfam_map:
                    pfam_map[str_gene_id] = []
                if str_gene_id not in kofam_map:
                    kofam_map[str_gene_id] = []
                if str_gene_id not in pfam_metagenome_map:
                    pfam_metagenome_map[str_gene_id] = []
                if str_gene_id not in kofam_metagenome_map:
                    kofam_metagenome_map[str_gene_id] = []
                
        self.pfam_map = pfam_map
        self.kofam_map = kofam_map
        self.pfam_metagenome_map = pfam_metagenome_map
        self.kofam_metagenome_map = kofam_metagenome_map
        
        return self
        
    def _process_hmm_data(self, hmm_data, domain_map, data_type):
        """
        Helper function to process HMM data and build domain mappings.
        
        Args:
            hmm_data (DataFrame): The HMM data to process
            domain_map (defaultdict): The map to populate
            data_type (str): Description of the data type for error messages
        """
        if hmm_data is None or len(hmm_data) == 0:
            print(f"No {data_type} data to process")
            return
        
        # Create a dictionary to track sequence lengths if this is metagenome data
        sequence_end_positions = {}
        is_metagenome = 'metagenome' in data_type.lower()
            
        for _, row in hmm_data.iterrows():
            try:
                seq_id = str(row['sequence_id'])
                hmm_name = str(row['hmm_name'])
                
                # Ensure numeric values are valid
                try:
                    bitscore = float(row['bitscore'])
                    if math.isnan(bitscore) or math.isinf(bitscore):
                        bitscore = 0.0
                except:
                    bitscore = 0.0
                    
                try:
                    e_value = float(row['evalue'])
                    if math.isnan(e_value) or math.isinf(e_value):
                        e_value = 1.0
                except:
                    e_value = 1.0
                    
                try:
                    env_from = int(row['env_from'])
                    if math.isnan(env_from):
                        env_from = 1
                except:
                    env_from = 1
                    
                try:
                    env_to = int(row['env_to'])
                    if math.isnan(env_to):
                        env_to = 1
                except:
                    env_to = 1
                
                # If this is metagenome data, track the maximum end position for each sequence
                if is_metagenome:
                    if seq_id not in sequence_end_positions or env_to > sequence_end_positions[seq_id]:
                        sequence_end_positions[seq_id] = env_to
                
                domain_map[seq_id].append({
                    'hmm_name': hmm_name,
                    'bitscore': bitscore,
                    'e_value': e_value,
                    'start': env_from,
                    'end': env_to
                })
            except Exception as e:
                print(f"Error processing {data_type} hit: {e}")
                continue
        
        # Ensure all values in maps are lists, not floats or other types
        for seq_id in list(domain_map.keys()):
            if not isinstance(domain_map[seq_id], list):
                print(f"Warning: {data_type} mapping for {seq_id} is not a list: {type(domain_map[seq_id])}. Fixing...")
                domain_map[seq_id] = []
        
        # If this is metagenome data, update the sequence lengths dictionary
        if is_metagenome and sequence_end_positions:
            # Update our global dictionary of sequence lengths
            for seq_id, end_pos in sequence_end_positions.items():
                if seq_id not in self.metagenome_sequence_lengths or end_pos > self.metagenome_sequence_lengths[seq_id]:
                    self.metagenome_sequence_lengths[seq_id] = end_pos
    
    def merge_data(self):
        """Merge binders data with HMM annotations."""
        if self.binders_data is None:
            raise ValueError("Data not loaded. Call load_data() first.")
            
        if not hasattr(self, 'pfam_map') or not hasattr(self, 'kofam_map'):
            self.process_hmm_hits()
        
        # Create a copy of the binders data
        self.merged_data = self.binders_data.copy()
        
        # Define a safe JSON conversion function
        def safe_json(obj):
            try:
                return json.dumps(obj)
            except:
                return '[]'
        
        # Add PFAM and KOFAM better binders domains with safer handling
        self.merged_data['PFAM_domains'] = self.merged_data['mimic_gene'].apply(
            lambda x: safe_json(self.pfam_map.get(str(x), []))
        )
        
        self.merged_data['KOFAM_domains'] = self.merged_data['mimic_gene'].apply(
            lambda x: safe_json(self.kofam_map.get(str(x), []))
        )
        
        # Add metagenome domains if they exist
        if hasattr(self, 'pfam_metagenome_map'):
            self.merged_data['PFAM_metagenome_domains'] = self.merged_data['mimic_gene'].apply(
                lambda x: safe_json(self.pfam_metagenome_map.get(str(x), []))
            )
        
        if hasattr(self, 'kofam_metagenome_map'):
            self.merged_data['KOFAM_metagenome_domains'] = self.merged_data['mimic_gene'].apply(
                lambda x: safe_json(self.kofam_metagenome_map.get(str(x), []))
            )
        
        # Add column for domain count
        self.merged_data['PFAM_domain_count'] = self.merged_data['mimic_gene'].apply(
            lambda x: len(self.pfam_map.get(str(x), []))
        )
        
        self.merged_data['KOFAM_domain_count'] = self.merged_data['mimic_gene'].apply(
            lambda x: len(self.kofam_map.get(str(x), []))
        )
        
        # Add metagenome domain counts if they exist
        if hasattr(self, 'pfam_metagenome_map'):
            self.merged_data['PFAM_metagenome_count'] = self.merged_data['mimic_gene'].apply(
                lambda x: len(self.pfam_metagenome_map.get(str(x), []))
            )
        
        if hasattr(self, 'kofam_metagenome_map'):
            self.merged_data['KOFAM_metagenome_count'] = self.merged_data['mimic_gene'].apply(
                lambda x: len(self.kofam_metagenome_map.get(str(x), []))
            )
        
        # Add string columns with comma-separated domain names for direct filtering
        self.merged_data['PFAM_domain_names'] = self.merged_data['mimic_gene'].apply(
            lambda x: ', '.join([d.get('hmm_name', '') for d in self.pfam_map.get(str(x), [])])
        )
        
        self.merged_data['KOFAM_domain_names'] = self.merged_data['mimic_gene'].apply(
            lambda x: ', '.join([d.get('hmm_name', '') for d in self.kofam_map.get(str(x), [])])
        )
        
        # Add metagenome domain names if they exist
        if hasattr(self, 'pfam_metagenome_map'):
            self.merged_data['PFAM_metagenome_names'] = self.merged_data['mimic_gene'].apply(
                lambda x: ', '.join([d.get('hmm_name', '') for d in self.pfam_metagenome_map.get(str(x), [])])
            )
        
        if hasattr(self, 'kofam_metagenome_map'):
            self.merged_data['KOFAM_metagenome_names'] = self.merged_data['mimic_gene'].apply(
                lambda x: ', '.join([d.get('hmm_name', '') for d in self.kofam_metagenome_map.get(str(x), [])])
            )
        
        # Add sequence length column
        self.merged_data['origin_seq_length'] = self.merged_data['mimic_gene'].apply(
            lambda x: self.metagenome_sequence_lengths.get(str(x), 0)
        )
        
        # Print sequence length statistics
        if 'origin_seq_length' in self.merged_data.columns:
            non_zero_lengths = self.merged_data[self.merged_data['origin_seq_length'] > 0]['origin_seq_length']
            if len(non_zero_lengths) > 0:
                print(f"Sequence length stats: min={non_zero_lengths.min()}, max={non_zero_lengths.max()}, avg={non_zero_lengths.mean():.1f}")
                print(f"Sequences with length data: {len(non_zero_lengths)} out of {len(self.merged_data)} ({len(non_zero_lengths) / len(self.merged_data) * 100:.1f}%)")
            else:
                print("No sequence length data available.")
        
        print(f"Merged data created with {len(self.merged_data)} rows")
        
        return self
    
    def get_column_metadata(self):
        """
        Get metadata about columns for frontend display and filtering.
        Returns information about data types and value ranges.
        """
        if self.merged_data is None:
            raise ValueError("Merged data not created. Call merge_data() first.")
            
        metadata = {}
        
        for column in self.merged_data.columns:
            col_data = self.merged_data[column]
            col_type = col_data.dtype
            
            if col_type == 'object':
                # String column
                metadata[column] = {
                    'type': 'string',
                    'unique_count': col_data.nunique(),
                    'example_values': col_data.dropna().sample(min(5, len(col_data.dropna()))).tolist() if len(col_data.dropna()) > 0 else []
                }
            elif np.issubdtype(col_type, np.number):
                # Numeric column
                metadata[column] = {
                    'type': 'numeric',
                    'min': float(col_data.min()) if not pd.isna(col_data.min()) else None,
                    'max': float(col_data.max()) if not pd.isna(col_data.max()) else None,
                    'mean': float(col_data.mean()) if not pd.isna(col_data.mean()) else None
                }
            elif col_type == 'bool':
                # Boolean column
                metadata[column] = {
                    'type': 'boolean',
                    'true_count': int(col_data.sum()),
                    'false_count': int(len(col_data) - col_data.sum())
                }
                
        return metadata
    
    def save_processed_data(self, output_dir=None):
        """
        Save the processed data to disk.
        
        Args:
            output_dir (str): Directory to save files to. Defaults to input dir.
        """
        if self.merged_data is None:
            raise ValueError("Merged data not created. Call merge_data() first.")
            
        if output_dir is None:
            output_dir = self.data_dir
            
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Save merged data
        output_path = os.path.join(output_dir, f"{self.sample_id}_processed_data.csv")
        self.merged_data.to_csv(output_path, index=False)
        
        # Save column metadata
        metadata = self.get_column_metadata()
        metadata_path = os.path.join(output_dir, f"{self.sample_id}_column_metadata.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
            
        print(f"Saved processed data to {output_path}")
        print(f"Saved column metadata to {metadata_path}")
        
        return output_path, metadata_path
    
    def get_data_summary(self):
        """Return a summary of the processed data."""
        if self.merged_data is None:
            raise ValueError("Merged data not created. Call merge_data() first.")
            
        summary = {
            'total_rows': len(self.merged_data),
            'unique_mimic_genes': self.merged_data['mimic_gene'].nunique(),
            'unique_mhc_types': self.merged_data['MHC'].nunique(),
            'unique_cancer_accs': self.merged_data['cancer_acc'].nunique()
        }
        
        # Safely add binding level counts
        try:
            summary['binding_level_counts'] = self.merged_data['mimic_BindLevel'].value_counts().to_dict()
        except Exception as e:
            print(f"Error getting binding_level_counts: {e}")
            summary['binding_level_counts'] = {}
        
        # Safely add PFAM better binders stats
        try:
            pfam_with_domains = (self.merged_data['PFAM_domain_count'] > 0).sum()
            pfam_avg = self.merged_data['PFAM_domain_count'].mean()
            
            summary['pfam_stats'] = {
                'total_sequences_with_domains': int(pfam_with_domains),
                'avg_domains_per_sequence': float(pfam_avg)
            }
        except Exception as e:
            print(f"Error getting PFAM stats: {e}")
            summary['pfam_stats'] = {
                'total_sequences_with_domains': 0,
                'avg_domains_per_sequence': 0
            }
        
        # Safely add KOFAM better binders stats
        try:
            kofam_with_domains = (self.merged_data['KOFAM_domain_count'] > 0).sum()
            kofam_avg = self.merged_data['KOFAM_domain_count'].mean()
            
            summary['kofam_stats'] = {
                'total_sequences_with_domains': int(kofam_with_domains),
                'avg_domains_per_sequence': float(kofam_avg)
            }
        except Exception as e:
            print(f"Error getting KOFAM stats: {e}")
            summary['kofam_stats'] = {
                'total_sequences_with_domains': 0,
                'avg_domains_per_sequence': 0
            }
        
        
        # Add sequence length stats
        if 'origin_seq_length' in self.merged_data.columns:
            try:
                # Only consider rows with valid sequence lengths
                length_data = self.merged_data[self.merged_data['origin_seq_length'] > 0]['origin_seq_length']
                
                if len(length_data) > 0:
                    summary['sequence_length_stats'] = {
                        'sequences_with_length_data': int(len(length_data)),
                        'percent_with_length_data': float(len(length_data) / len(self.merged_data) * 100),
                        'min_length': int(length_data.min()),
                        'max_length': int(length_data.max()),
                        'mean_length': float(length_data.mean()),
                        'median_length': float(length_data.median())
                    }
                else:
                    summary['sequence_length_stats'] = {
                        'sequences_with_length_data': 0,
                        'percent_with_length_data': 0,
                        'min_length': 0,
                        'max_length': 0,
                        'mean_length': 0,
                        'median_length': 0
                    }
            except Exception as e:
                print(f"Error getting sequence length stats: {e}")
                summary['sequence_length_stats'] = {
                    'sequences_with_length_data': 0,
                    'percent_with_length_data': 0,
                    'min_length': 0,
                    'max_length': 0,
                    'mean_length': 0,
                    'median_length': 0
                }
        
        return summary

    def get_sequence_data(self, sequence_id):
        """
        Get comprehensive data for a specific sequence ID.
        
        Args:
            sequence_id (str): The sequence ID to retrieve data for
            
        Returns:
            dict: Dictionary containing all data related to the sequence
        """
        if self.merged_data is None:
            raise ValueError("Merged data not created. Call merge_data() first.")
            
        # Get basic sequence information
        sequence_rows = self.merged_data[self.merged_data['mimic_gene'] == sequence_id]
        
        if len(sequence_rows) == 0:
            return None  # Sequence not found
            
        # Extract the first row for basic info
        first_row = sequence_rows.iloc[0].to_dict()
        
        # Extract domain information from better binders - ensure we always get a list
        # Handle case where domains might not be iterable (e.g. float)
        try:
            pfam_domains = self.pfam_map.get(str(sequence_id), [])
            if not isinstance(pfam_domains, list):
                pfam_domains = []
        except Exception as e:
            print(f"Error accessing PFAM domains for {sequence_id}: {e}")
            pfam_domains = []
            
        try:
            kofam_domains = self.kofam_map.get(str(sequence_id), [])
            if not isinstance(kofam_domains, list):
                kofam_domains = []
        except Exception as e:
            print(f"Error accessing KOFAM domains for {sequence_id}: {e}")
            kofam_domains = []
            
        # Extract domain information from metagenome if available
        pfam_metagenome_domains = []
        if hasattr(self, 'pfam_metagenome_map'):
            try:
                pfam_metagenome_domains = self.pfam_metagenome_map.get(str(sequence_id), [])
                if not isinstance(pfam_metagenome_domains, list):
                    pfam_metagenome_domains = []
            except Exception as e:
                print(f"Error accessing PFAM metagenome domains for {sequence_id}: {e}")
                pfam_metagenome_domains = []
        
        kofam_metagenome_domains = []
        if hasattr(self, 'kofam_metagenome_map'):
            try:
                kofam_metagenome_domains = self.kofam_metagenome_map.get(str(sequence_id), [])
                if not isinstance(kofam_metagenome_domains, list):
                    kofam_metagenome_domains = []
            except Exception as e:
                print(f"Error accessing KOFAM metagenome domains for {sequence_id}: {e}")
                kofam_metagenome_domains = []
        
        # Get binding data and clean it up
        binding_data = sequence_rows.to_dict(orient='records')
        
        # Make sure binding levels are strings to avoid template issues
        for binding in binding_data:
            # Convert mimic_BindLevel to string if it's not already
            if 'mimic_BindLevel' in binding and not isinstance(binding['mimic_BindLevel'], str):
                try:
                    binding['mimic_BindLevel'] = str(binding['mimic_BindLevel'])
                except Exception as e:
                    print(f"Error converting binding level to string: {e}")
                    binding['mimic_BindLevel'] = 'Unknown'
        
        # Try to get the actual sequence from FASTA if available
        sequence_text = self.get_sequence_fasta(sequence_id)
        
        # Get sequence length
        seq_length = self.metagenome_sequence_lengths.get(str(sequence_id), 0)
        if seq_length == 0 and sequence_text:
            # If we have the actual sequence, use its length
            seq_length = len(sequence_text)
        
        # Prepare basic information with extra safety checks
        try:
            basic_info = {
                'Mimic Gene': sequence_id,
                'Cancer Gene': first_row.get('cancer_acc', 'N/A'),
                'Cancer DB': first_row.get('cancer_DB', 'N/A'),
                'Sequence Length': seq_length,
                'PFAM Domains': len(pfam_domains) if isinstance(pfam_domains, list) else 0,
                'KOFAM Domains': len(kofam_domains) if isinstance(kofam_domains, list) else 0,
                'PFAM Metagenome Domains': len(pfam_metagenome_domains) if isinstance(pfam_metagenome_domains, list) else 0,
                'KOFAM Metagenome Domains': len(kofam_metagenome_domains) if isinstance(kofam_metagenome_domains, list) else 0,
                'MHC Binding Sites': len(binding_data) if isinstance(binding_data, list) else 0
            }
        except Exception as e:
            print(f"Error creating basic info for {sequence_id}: {e}")
            basic_info = {
                'Mimic Gene': sequence_id,
                'Cancer Gene': 'N/A',
                'Cancer DB': 'N/A',
                'Sequence Length': seq_length,
                'PFAM Domains': 0,
                'KOFAM Domains': 0,
                'PFAM Metagenome Domains': 0,
                'KOFAM Metagenome Domains': 0,
                'MHC Binding Sites': 0
            }
        
        # Calculate binding position histogram data
        binding_positions = self._calculate_binding_positions(binding_data, sequence_text)
        
        # Ensure binding_positions is JSON serializable (not None or undefined)
        if binding_positions is None:
            binding_positions = []
        
        return {
            'sequence_id': sequence_id,
            'basic_info': basic_info,
            'pfam_domains': pfam_domains,
            'kofam_domains': kofam_domains,
            'pfam_metagenome_domains': pfam_metagenome_domains,
            'kofam_metagenome_domains': kofam_metagenome_domains,
            'binding_data': binding_data,
            'sequence': sequence_text,
            'binding_positions': binding_positions,
            'raw_data': first_row
        }
        
    def _calculate_binding_positions(self, binding_data, full_sequence):
        """
        Calculate histogram data for binding positions in the sequence.
        
        Args:
            binding_data (list): List of dictionaries containing binding data
            full_sequence (str): The full protein sequence
            
        Returns:
            list: List of dictionaries with position and count for histogram
        """
        try:
            # Initialize position counters
            position_counts = {}
            
            # Validate inputs
            if not binding_data or not isinstance(binding_data, list):
                print("Warning: binding_data is not a valid list")
                return []
            
            # Ensure full_sequence is a string
            if full_sequence is None:
                full_sequence = ""
            elif not isinstance(full_sequence, str):
                print(f"Warning: full_sequence is not a string but a {type(full_sequence)}")
                full_sequence = str(full_sequence) if full_sequence else ""
            
            # Estimate sequence length
            sequence_length = len(full_sequence) if full_sequence else 0
            
            # If we don't have the full sequence, try to estimate from domain data
            if sequence_length == 0:
                for binding in binding_data:
                    if not isinstance(binding, dict):
                        print(f"Warning: binding record is not a dict but a {type(binding)}")
                        continue
                        
                    if 'mimic_Peptide' not in binding:
                        continue
                        
                    peptide = binding.get('mimic_Peptide', '')
                    if not isinstance(peptide, str):
                        peptide = str(peptide) if peptide else ""
                        
                    if len(peptide) > sequence_length:
                        sequence_length = len(peptide)
                
                # Still no length information, use a default
                if sequence_length == 0:
                    sequence_length = 1000
                    
                print(f"Estimated sequence length: {sequence_length}")
            
            # Count of valid binding records processed
            valid_bindings = 0
            
            # Process each binding record
            for binding in binding_data:
                if not isinstance(binding, dict):
                    print(f"Skipping non-dict binding record: {type(binding)}")
                    continue
                    
                if 'mimic_Peptide' not in binding:
                    continue
                    
                peptide = binding.get('mimic_Peptide', '')
                if not isinstance(peptide, str):
                    peptide = str(peptide) if peptide else ""
                    
                if not peptide:
                    continue
                
                valid_bindings += 1
                    
                # Try to find the peptide in the full sequence
                position = -1
                if full_sequence:
                    position = full_sequence.find(peptide)
                
                # If found in sequence or have specific position data
                if position >= 0:
                    # Add position information to the binding record
                    binding['position_start'] = position
                    binding['position_end'] = position + len(peptide) - 1
                    
                    # For each position in the peptide, increment the counter for histogram
                    for i in range(position, position + len(peptide)):
                        position_counts[i] = position_counts.get(i, 0) + 1
                elif 'position' in binding:
                    # Use provided position if available
                    try:
                        position_val = binding.get('position', 0)
                        if isinstance(position_val, (int, float)):
                            start_pos = int(position_val)
                            # Add position information to the binding record
                            binding['position_start'] = start_pos
                            binding['position_end'] = start_pos + len(peptide) - 1
                            
                            # Update histogram data
                            for i in range(start_pos, start_pos + len(peptide)):
                                position_counts[i] = position_counts.get(i, 0) + 1
                        else:
                            print(f"Skipping invalid position value: {position_val}")
                    except (ValueError, TypeError) as e:
                        print(f"Error processing position: {e}")
                        continue
                else:
                    # Position not found - can create a pseudo-position relative to other sequences
                    # Add placeholder values to indicate no position data
                    binding['position_start'] = -1
                    binding['position_end'] = -1
                    continue
            
            print(f"Processed {valid_bindings} valid binding records out of {len(binding_data)} total")
            
            # Convert to format for visualization
            position_data = [
                {'position': pos, 'count': count}
                for pos, count in position_counts.items()
            ]
            
            # Sort by position
            position_data.sort(key=lambda x: x['position'])
            
            print(f"Generated {len(position_data)} position data points")
            
            return position_data
            
        except Exception as e:
            # If anything goes wrong, return an empty list to avoid breaking the page
            import traceback
            print(f"Error calculating binding positions: {e}")
            print(traceback.format_exc())
            return []
    
    def analyze_binding_domain_intersections(self, binding_affinity_threshold=500, binding_level=None, max_sequences=None, progress_callback=None):
        """
        Analyze which PFAM domains contain mimic sequences.
        
        Args:
            binding_affinity_threshold (float): Max affinity value to include (nM)
            binding_level (str, optional): Filter to specific binding level (e.g., "<= SB")
            max_sequences (int, optional): Maximum number of sequences to process (for optimization)
            progress_callback (callable, optional): Function to call with progress updates (0-100)
            
        Returns:
            dict: Analysis results including domain-binding overlap counts
        """
        try:
            import multiprocessing as mp
            import numpy as np
            from collections import Counter, defaultdict
            import time
            from concurrent.futures import ThreadPoolExecutor, as_completed
            
            # Enable memory usage tracking for optimization
            tracemalloc.start()
            
            print(f"Analyzing domain-binding intersections with threshold {binding_affinity_threshold}nM, level filter: {binding_level}")
            
            if self.merged_data is None:
                raise ValueError("Merged data not created. Call merge_data() first.")
            
            start_time = time.time()
            
            # Track progress
            progress = 0
            if progress_callback:
                progress_callback(progress)
            
            # Use more efficient filtering with polars if available
            if HAS_POLARS:
                print("Using polars for data filtering")
                # Convert pandas DataFrame to polars
                pl_df = pl.from_pandas(self.merged_data)
                
                # Apply filters
                filter_expressions = []
                if binding_level:
                    filter_expressions.append(pl.col('mimic_BindLevel') == binding_level)
                if binding_affinity_threshold is not None:
                    filter_expressions.append(pl.col('mimic_Aff(nM)') <= binding_affinity_threshold)
                
                if filter_expressions:
                    # Handle multiple expressions with logical AND
                    if len(filter_expressions) > 1:
                        # Create combined expression with AND logic
                        combined_expr = filter_expressions[0]
                        for expr in filter_expressions[1:]:
                            combined_expr = combined_expr & expr
                        filtered_pl = pl_df.filter(combined_expr)
                    else:
                        # Just one expression
                        filtered_pl = pl_df.filter(filter_expressions[0])
                else:
                    filtered_pl = pl_df
                
                # Convert back to pandas for compatibility with the rest of the code
                filtered_data = filtered_pl.to_pandas()
                
            else:
                # Fall back to pandas filtering if polars is not available
                # Filter binding data based on thresholds
                filter_conditions = []
                
                if binding_level:
                    filter_conditions.append(self.merged_data['mimic_BindLevel'] == binding_level)
                    
                if binding_affinity_threshold is not None:
                    filter_conditions.append(self.merged_data['mimic_Aff(nM)'] <= binding_affinity_threshold)
                
                # Apply all filters at once (more efficient)
                if filter_conditions:
                    combined_filter = pd.concat(filter_conditions, axis=1).all(axis=1) if len(filter_conditions) > 1 else filter_conditions[0]
                    filtered_data = self.merged_data[combined_filter]
                else:
                    filtered_data = self.merged_data.copy()
            
            print(f"Found {len(filtered_data)} binding records after filtering in {time.time() - start_time:.2f}s")
            
            progress = 5
            if progress_callback:
                progress_callback(progress)
            
            # Skip processing if no data after filtering
            if len(filtered_data) == 0:
                tracemalloc.stop()
                if progress_callback:
                    progress_callback(100)
                return {
                    'total_sequences': 0,
                    'domain_binding_counts': {},
                    'domain_summaries': [],
                    'processed_sequences': 0,
                    'total_unique_sequences': 0,
                    'found_sequences_with_peptides': 0,
                    'binding_threshold': binding_affinity_threshold,
                    'binding_level': binding_level
                }
            
            # Get unique sequence IDs for faster processing
            unique_sequences = filtered_data['mimic_gene'].unique()
            
            # Limit number of sequences if specified
            if max_sequences and len(unique_sequences) > max_sequences:
                unique_sequences = unique_sequences[:max_sequences]
                filtered_data = filtered_data[filtered_data['mimic_gene'].isin(unique_sequences)]
            
            # Pre-process: Group data by sequence ID for faster access
            # Use dictionary groupby instead of pandas groupby for better performance
            sequence_groups = {}
            for _, row in filtered_data.iterrows():
                seq_id = row['mimic_gene']
                if seq_id not in sequence_groups:
                    sequence_groups[seq_id] = []
                sequence_groups[seq_id].append(row)
            
            # Create data structures to store binding positions and valid sequences
            binding_positions_data = []
            valid_sequence_ids = []
            
            # Use optimized batch sequences retrieval
            batch_size = 100
            total_sequences = len(unique_sequences)
            processed_count = 0
            
            # Process sequences in batches
            for batch_start in range(0, total_sequences, batch_size):
                batch_end = min(batch_start + batch_size, total_sequences)
                batch_sequences = unique_sequences[batch_start:batch_end]
                
                # Convert to strings for sequence retrieval
                batch_sequence_ids = [str(seq_id) for seq_id in batch_sequences if not pd.isna(seq_id)]
                
                # Batch retrieve sequences using our optimized method
                batch_sequence_data = self.get_sequences_batch(batch_sequence_ids)
                
                # Process each sequence in the batch
                for sequence_id in batch_sequences:
                    if pd.isna(sequence_id):
                        continue
                        
                    processed_count += 1
                    # Update progress
                    if progress_callback and processed_count % max(1, total_sequences // 20) == 0:
                        new_progress = 5 + int((processed_count / total_sequences) * 25)
                        if new_progress > progress:
                            progress = new_progress
                            progress_callback(progress)
                    
                    # Get sequence rows
                    sequence_rows = sequence_groups.get(sequence_id, [])
                    if not sequence_rows:
                        continue
                    
                    # Get sequence
                    sequence = batch_sequence_data.get(str(sequence_id), "")
                    if not sequence:
                        continue
                    
                    valid_sequence_ids.append(sequence_id)
                    
                    # Process all peptides for this sequence at once
                    for row in sequence_rows:
                        peptide = row.get('mimic_Peptide', '')
                        if not peptide or not isinstance(peptide, str):
                            continue
                        
                        position = sequence.find(peptide)
                        if position >= 0:
                            binding_positions_data.append({
                                'sequence_id': sequence_id,
                                'peptide': peptide,
                                'start': position,
                                'end': position + len(peptide) - 1,
                                'affinity': row.get('mimic_Aff(nM)'),
                                'mhc_type': row.get('MHC'),
                                'bind_level': row.get('mimic_BindLevel')
                            })
            
            # Use numpy for faster data processing
            # Convert binding positions to structured numpy array for more efficient processing
            if not binding_positions_data:
                tracemalloc.stop()
                if progress_callback:
                    progress_callback(100)
                return {
                    'total_sequences': 0,
                    'domain_binding_counts': {},
                    'domain_summaries': [],
                    'processed_sequences': processed_count,
                    'total_unique_sequences': 0,
                    'found_sequences_with_peptides': 0,
                    'binding_threshold': binding_affinity_threshold,
                    'binding_level': binding_level
                }
            
            # Convert to DataFrame for compatibility with downstream code
            binding_df = pd.DataFrame(binding_positions_data)
            
            # Update progress to 30%
            progress = 30
            if progress_callback:
                progress_callback(progress)
            
            # Get valid sequence set
            valid_sequence_set = set(binding_df['sequence_id'].unique())
            
            # Create optimized domain data structure
            # Pre-index domains by sequence ID for faster access
            sequence_to_domains = defaultdict(list)
            
            # Only process domains for sequences with binding positions
            for seq_id in valid_sequence_set:
                pfam_domains = self.pfam_map.get(str(seq_id), [])
                for domain in pfam_domains:
                    if not isinstance(domain, dict) or 'start' not in domain or 'end' not in domain:
                        continue
                        
                    sequence_to_domains[seq_id].append({
                        'sequence_id': seq_id,
                        'domain_name': domain.get('hmm_name', 'unknown'),
                        'start': domain.get('start', 0),
                        'end': domain.get('end', 0),
                        'bitscore': domain.get('bitscore', 0),
                        'e_value': domain.get('e_value', 1.0)
                    })
            
            # Skip if no valid domains found
            if not any(sequence_to_domains.values()):
                tracemalloc.stop()
                if progress_callback:
                    progress_callback(100)
                return {
                    'total_sequences': len(valid_sequence_set),
                    'domain_binding_counts': {},
                    'domain_summaries': [],
                    'processed_sequences': processed_count,
                    'total_unique_sequences': len(valid_sequence_set),
                    'found_sequences_with_peptides': len(valid_sequence_ids),
                    'binding_threshold': binding_affinity_threshold,
                    'binding_level': binding_level
                }
            
            # Update progress to 40%
            progress = 40
            if progress_callback:
                progress_callback(progress)
            
            # Pre-index bindings by sequence ID
            # Fast bindings lookup dictionary
            bindings_by_sequence = defaultdict(list)
            for _, binding in binding_df.iterrows():
                seq_id = binding['sequence_id']
                bindings_by_sequence[seq_id].append({
                    'peptide': binding['peptide'],
                    'start': binding['start'],
                    'end': binding['end'],
                    'affinity': binding['affinity'],
                    'mhc_type': binding['mhc_type'],
                    'bind_level': binding['bind_level']
                })
            
            # Define an optimized intersection function that works on batches
            def find_domain_binding_intersections(sequence_id_batch):
                results = []
                
                for seq_id in sequence_id_batch:
                    # Get domains and bindings for this sequence
                    domains = sequence_to_domains.get(seq_id, [])
                    bindings = bindings_by_sequence.get(seq_id, [])
                    
                    if not domains or not bindings:
                        continue
                    
                    # For each domain, find bindings that intersect with it
                    for domain in domains:
                        domain_start = domain['start']
                        domain_end = domain['end']
                        
                        # Check each binding for intersection
                        for binding in bindings:
                            binding_start = binding['start']
                            binding_end = binding['end']
                            
                            # Check if they overlap
                            if binding_start <= domain_end and binding_end >= domain_start:
                                # Calculate overlap percentage
                                overlap_start = max(binding_start, domain_start)
                                overlap_end = min(binding_end, domain_end)
                                overlap_length = overlap_end - overlap_start + 1
                                binding_length = binding_end - binding_start + 1
                                overlap_pct = (overlap_length / binding_length) * 100
                                
                                # Only count if overlap is significant (more than 50%)
                                if overlap_pct >= 50:
                                    results.append({
                                        'sequence_id': seq_id,
                                        'domain': domain['domain_name'],
                                        'domain_start': domain_start,
                                        'domain_end': domain_end,
                                        'binding': binding,
                                        'overlap_pct': overlap_pct,
                                        'bitscore': domain['bitscore'],
                                        'e_value': domain['e_value']
                                    })
                
                return results
            
            # Optimize parallelism based on data size and CPU cores
            num_workers = min(mp.cpu_count(), 8)
            
            # Split sequences into batches for parallel processing
            sequence_batches = np.array_split(list(valid_sequence_set), num_workers)
            
            # Process in parallel with improved work distribution and progress tracking
            all_results = []
            with ThreadPoolExecutor(max_workers=num_workers) as executor:
                # Submit all tasks at once
                future_to_batch = {executor.submit(find_domain_binding_intersections, batch): i 
                                  for i, batch in enumerate(sequence_batches)}
                
                # Process results as they complete (instead of waiting for each one)
                for future in as_completed(future_to_batch):
                    batch_idx = future_to_batch[future]
                    try:
                        batch_results = future.result()
                        all_results.extend(batch_results)
                        
                        # Update progress more smoothly
                        if progress_callback:
                            new_progress = 40 + int((batch_idx + 1) / num_workers * 50)
                            if new_progress > progress:
                                progress = new_progress
                                progress_callback(progress)
                    except Exception as e:
                        print(f"Error processing batch {batch_idx}: {e}")
            
            # Update progress to 90%
            progress = 90
            if progress_callback:
                progress_callback(progress)
            
            # Skip if no intersections found
            if not all_results:
                tracemalloc.stop()
                if progress_callback:
                    progress_callback(100)
                return {
                    'total_sequences': len(valid_sequence_set),
                    'domain_binding_counts': {},
                    'domain_summaries': [],
                    'processed_sequences': processed_count,
                    'total_unique_sequences': len(valid_sequence_set),
                    'found_sequences_with_peptides': len(valid_sequence_ids),
                    'binding_threshold': binding_affinity_threshold,
                    'binding_level': binding_level
                }
            
            # Use Counter for domain statistics - much faster than pandas groupby
            domain_counter = Counter()
            domain_seq_counter = defaultdict(set)  # Using sets instead of Counter for sequence IDs
            domain_bitscore_sum = defaultdict(float)
            domain_bitscore_count = defaultdict(int)
            domain_affinity_sum = defaultdict(float)
            domain_affinity_count = defaultdict(int)
            domain_sequences = defaultdict(set)
            
            # Process results with a single pass through the data
            for result in all_results:
                domain = result['domain']
                domain_counter[domain] += 1
                domain_seq_counter[domain].add(result['sequence_id'])  # Add to set instead of using |=
                
                # Track bitscore
                if 'bitscore' in result and result['bitscore'] is not None:
                    domain_bitscore_sum[domain] += result['bitscore']
                    domain_bitscore_count[domain] += 1
                
                # Track affinity
                if 'binding' in result and isinstance(result['binding'], dict) and 'affinity' in result['binding']:
                    affinity = result['binding']['affinity']
                    if affinity is not None:
                        domain_affinity_sum[domain] += affinity
                        domain_affinity_count[domain] += 1
                
                # Track sequences (limited to 100 per domain)
                if len(domain_sequences[domain]) < 100:
                    domain_sequences[domain].add(result['sequence_id'])
            
            # Calculate domain summaries directly from counters
            domain_summaries = []
            for domain in domain_counter:
                # Calculate averages
                avg_bitscore = domain_bitscore_sum[domain] / domain_bitscore_count[domain] if domain_bitscore_count[domain] > 0 else 0
                avg_affinity = domain_affinity_sum[domain] / domain_affinity_count[domain] if domain_affinity_count[domain] > 0 else 0
                
                domain_summary = {
                    'domain': domain,
                    'binding_count': domain_counter[domain],
                    'sequence_count': len(domain_seq_counter[domain]),
                    'pct_of_sequences': (len(domain_seq_counter[domain]) / len(valid_sequence_set) * 100) if len(valid_sequence_set) > 0 else 0,
                    'avg_bitscore': float(avg_bitscore),
                    'avg_affinity': float(avg_affinity),
                    'sequences': list(domain_sequences[domain])
                }
                domain_summaries.append(domain_summary)
            
            # Sort domain summaries by binding count (descending)
            domain_summaries.sort(key=lambda x: x['binding_count'], reverse=True)
            
            # Report memory usage
            current, peak = tracemalloc.get_traced_memory()
            print(f"Current memory usage: {current / 10**6:.1f} MB; Peak: {peak / 10**6:.1f} MB")
            tracemalloc.stop()
            
            # Update progress to 100%
            if progress_callback:
                progress_callback(100)
            
            print(f"Domain binding analysis completed in {time.time() - start_time:.2f}s")
            
            # Return comprehensive results
            return {
                'total_sequences': len(valid_sequence_set),
                'domain_binding_counts': dict(domain_counter),
                'domain_summaries': domain_summaries,
                'processed_sequences': processed_count,
                'total_unique_sequences': len(valid_sequence_set),
                'found_sequences_with_peptides': len(valid_sequence_ids),
                'binding_threshold': binding_affinity_threshold,
                'binding_level': binding_level
            }
            
        except Exception as e:
            # If anything goes wrong, return basic error info
            import traceback
            print(f"Error analyzing binding domain intersections: {e}")
            print(traceback.format_exc())
            
            try:
                tracemalloc.stop()
            except:
                pass
                
            if progress_callback:
                progress_callback(100)  # Complete the progress bar even on error
                
            return {
                'error': str(e),
                'total_sequences': 0,
                'domain_binding_counts': {},
                'domain_summaries': [],
                'domain_binding_details': {}
            }
        
    def _load_sequence_lengths_from_fasta(self):
        """
        Load sequence lengths from all FASTA files in the data directory.
        This is more accurate than estimating from domain positions.
        """
        import os
        
        fasta_files = [f for f in os.listdir(self.data_dir) if f.endswith('.faa') or f.endswith('.fasta')]
        
        if not fasta_files:
            print("No FASTA files found in the data directory.")
            return
        
        print(f"Loading sequence lengths from FASTA files: {fasta_files}")
        
        # Dictionary to store sequence lengths
        sequence_lengths = {}
        
        # Process each FASTA file
        for fasta_file in fasta_files:
            file_path = os.path.join(self.data_dir, fasta_file)
            try:
                with open(file_path, 'r') as f:
                    current_id = None
                    current_seq = []
                    
                    for line in f:
                        line = line.strip()
                        if line.startswith('>'):
                            # Store the length of the previous sequence if we have one
                            if current_id is not None and current_seq:
                                seq_length = len(''.join(current_seq))
                                sequence_lengths[current_id] = seq_length
                            
                            # Parse the ID from the header line
                            header_parts = line[1:].split()
                            current_id = header_parts[0] if header_parts else ""
                            current_seq = []
                        else:
                            # Add this line to the current sequence
                            current_seq.append(line)
                    
                    # Don't forget to store the last sequence
                    if current_id is not None and current_seq:
                        seq_length = len(''.join(current_seq))
                        sequence_lengths[current_id] = seq_length
                
                print(f"Loaded {len(sequence_lengths)} sequence lengths from {fasta_file}")
            except Exception as e:
                print(f"Error reading FASTA file {fasta_file}: {e}")
        
        # Update the global dictionary with the lengths
        self.metagenome_sequence_lengths.update(sequence_lengths)
        print(f"Total sequences with lengths: {len(self.metagenome_sequence_lengths)}")

    def get_sequence_fasta(self, sequence_id):
        """
        Attempt to load the actual sequence text from FASTA files.
        
        This method uses the optimized sequence cache for fast retrieval.
        
        Args:
            sequence_id (str): The sequence ID to retrieve
            
        Returns:
            str: The sequence text if found, empty string otherwise
        """
        # Use our optimized sequence cache for fast retrieval
        return self.sequence_cache.get_sequence(sequence_id)
    
    def get_sequences_batch(self, sequence_ids):
        """
        Efficiently retrieve multiple sequences in one batch operation.
        
        Args:
            sequence_ids: List of sequence IDs to retrieve
            
        Returns:
            Dictionary mapping sequence IDs to their sequences
        """
        return self.sequence_cache.get_sequences_batch(sequence_ids)
    
    def get_global_domain_frequencies(self):
        """
        Calculate global domain frequencies from all available data.
        
        Returns:
            dict: Dictionary with PFAM and KOFAM domain frequencies
        """
        # Domain frequency counters
        pfam_better_binders_freq = {}  # For better binders
        pfam_metagenome_freq = {}      # For metagenome
        kofam_better_binders_freq = {}
        kofam_metagenome_freq = {}
        
        # Get all unique genes/sequences
        if self.merged_data is not None:
            all_genes = self.merged_data['mimic_gene'].unique().tolist()
        else:
            # Fallbacks if merged data not available
            all_genes = []
            
            # Try to get genes from PFAM data
            if self.pfam_binders_data is not None:
                all_genes.extend(self.pfam_binders_data['sequence_id'].unique().tolist())
            
            # Try to get genes from KOFAM data
            if self.kofam_binders_data is not None:
                all_genes.extend(self.kofam_binders_data['sequence_id'].unique().tolist())
                
            # Remove duplicates
            all_genes = list(set(all_genes))
        
        print(f"DEBUG: Calculating global domain frequencies for {len(all_genes)} genes")
        
        # Count domains across all genes
        for gene in all_genes:
            # Count PFAM better binders domains
            if hasattr(self, 'pfam_map'):
                pfam_domains = self.pfam_map.get(str(gene), [])
                for domain in pfam_domains:
                    if isinstance(domain, dict) and 'hmm_name' in domain:
                        domain_name = domain['hmm_name']
                        if domain_name not in pfam_better_binders_freq:
                            pfam_better_binders_freq[domain_name] = 0
                        pfam_better_binders_freq[domain_name] += 1
            
            # Count KOFAM better binders domains
            if hasattr(self, 'kofam_map'):
                kofam_domains = self.kofam_map.get(str(gene), [])
                for domain in kofam_domains:
                    if isinstance(domain, dict) and 'hmm_name' in domain:
                        domain_name = domain['hmm_name']
                        if domain_name not in kofam_better_binders_freq:
                            kofam_better_binders_freq[domain_name] = 0
                        kofam_better_binders_freq[domain_name] += 1
            
            # Count PFAM metagenome domains
            if hasattr(self, 'pfam_metagenome_map'):
                pfam_meta_domains = self.pfam_metagenome_map.get(str(gene), [])
                for domain in pfam_meta_domains:
                    if isinstance(domain, dict) and 'hmm_name' in domain:
                        domain_name = domain['hmm_name']
                        if domain_name not in pfam_metagenome_freq:
                            pfam_metagenome_freq[domain_name] = 0
                        pfam_metagenome_freq[domain_name] += 1
            
            # Count KOFAM metagenome domains
            if hasattr(self, 'kofam_metagenome_map'):
                kofam_meta_domains = self.kofam_metagenome_map.get(str(gene), [])
                for domain in kofam_meta_domains:
                    if isinstance(domain, dict) and 'hmm_name' in domain:
                        domain_name = domain['hmm_name']
                        if domain_name not in kofam_metagenome_freq:
                            kofam_metagenome_freq[domain_name] = 0
                        kofam_metagenome_freq[domain_name] += 1
        
        # DEBUG information about the counts
        print(f"DEBUG: PFAM better binders domain counts: {len(pfam_better_binders_freq)} unique domains")
        print(f"DEBUG: PFAM metagenome domain counts: {len(pfam_metagenome_freq)} unique domains")
        print(f"DEBUG: KOFAM better binders domain counts: {len(kofam_better_binders_freq)} unique domains")
        print(f"DEBUG: KOFAM metagenome domain counts: {len(kofam_metagenome_freq)} unique domains")
        
        # Show some sample domains if available
        if pfam_better_binders_freq:
            sample_pfam = list(pfam_better_binders_freq.items())[:3]
            print(f"DEBUG: Sample PFAM domains: {sample_pfam}")
        
        return {
            'pfam_better_binders': pfam_better_binders_freq,
            'pfam_metagenome': pfam_metagenome_freq,
            'kofam_better_binders': kofam_better_binders_freq,
            'kofam_metagenome': kofam_metagenome_freq
        }
    
    def get_cancer_data(self, cancer_acc):
        """
        Get comprehensive data for a specific cancer accession.
        
        Args:
            cancer_acc (str): The cancer accession to retrieve data for
            
        Returns:
            dict: Dictionary containing all data related to the cancer accession
        """
        if self.merged_data is None:
            raise ValueError("Merged data not created. Call merge_data() first.")
            
        # Get all rows for this cancer accession
        cancer_rows = self.merged_data[self.merged_data['cancer_acc'] == cancer_acc]
        
        if len(cancer_rows) == 0:
            return None  # Cancer accession not found
            
        # Extract the first row for basic info
        first_row = cancer_rows.iloc[0].to_dict()
        
        # Get unique mimic genes associated with this cancer accession
        mimic_genes = cancer_rows['mimic_gene'].unique().tolist()
        
        # Get MHC alleles associated with this cancer accession
        mhc_alleles = cancer_rows['MHC'].unique().tolist()
        
        # Count all domains and their frequencies
        pfam_domain_counts = {}
        kofam_domain_counts = {}
        
        # Extract and count domains from associated mimic genes
        for gene in mimic_genes:
            # Get PFAM better binders domains with error handling
            try:
                pfam_domains = self.pfam_map.get(str(gene), [])
                if not isinstance(pfam_domains, list):
                    pfam_domains = []
                    
                for domain in pfam_domains:
                    if not isinstance(domain, dict) or 'hmm_name' not in domain:
                        continue
                    
                    domain_name = domain['hmm_name']
                    if domain_name not in pfam_domain_counts:
                        pfam_domain_counts[domain_name] = {
                            'count': 0, 
                            'genes': [],
                            'e_values': [],
                            'bitscores': []
                        }
                    
                    pfam_domain_counts[domain_name]['count'] += 1
                    pfam_domain_counts[domain_name]['genes'].append(gene)
                    pfam_domain_counts[domain_name]['e_values'].append(domain.get('e_value', 1.0))
                    pfam_domain_counts[domain_name]['bitscores'].append(domain.get('bitscore', 0.0))
                    
            except Exception as e:
                print(f"Error processing PFAM domains for cancer {cancer_acc}, gene {gene}: {e}")
            
            # Get KOFAM better binders domains with error handling
            try:
                kofam_domains = self.kofam_map.get(str(gene), [])
                if not isinstance(kofam_domains, list):
                    kofam_domains = []
                    
                for domain in kofam_domains:
                    if not isinstance(domain, dict) or 'hmm_name' not in domain:
                        continue
                    
                    domain_name = domain['hmm_name']
                    if domain_name not in kofam_domain_counts:
                        kofam_domain_counts[domain_name] = {
                            'count': 0, 
                            'genes': [],
                            'e_values': [],
                            'bitscores': []
                        }
                    
                    kofam_domain_counts[domain_name]['count'] += 1
                    kofam_domain_counts[domain_name]['genes'].append(gene)
                    kofam_domain_counts[domain_name]['e_values'].append(domain.get('e_value', 1.0))
                    kofam_domain_counts[domain_name]['bitscores'].append(domain.get('bitscore', 0.0))
                    
            except Exception as e:
                print(f"Error processing KOFAM domains for cancer {cancer_acc}, gene {gene}: {e}")
                
            # Get PFAM metagenome domains if available
            if hasattr(self, 'pfam_metagenome_map'):
                try:
                    pfam_meta_domains = self.pfam_metagenome_map.get(str(gene), [])
                    if not isinstance(pfam_meta_domains, list):
                        pfam_meta_domains = []
                        
                    for domain in pfam_meta_domains:
                        if not isinstance(domain, dict) or 'hmm_name' not in domain:
                            continue
                        
                        domain_name = domain['hmm_name']
                        # Add a prefix to avoid collisions with better binders domains
                        domain_name = "META_" + domain_name
                        
                        if domain_name not in pfam_domain_counts:
                            pfam_domain_counts[domain_name] = {
                                'count': 0, 
                                'genes': [],
                                'e_values': [],
                                'bitscores': [],
                                'is_metagenome': True
                            }
                        
                        pfam_domain_counts[domain_name]['count'] += 1
                        pfam_domain_counts[domain_name]['genes'].append(gene)
                        pfam_domain_counts[domain_name]['e_values'].append(domain.get('e_value', 1.0))
                        pfam_domain_counts[domain_name]['bitscores'].append(domain.get('bitscore', 0.0))
                        
                except Exception as e:
                    print(f"Error processing PFAM metagenome domains for cancer {cancer_acc}, gene {gene}: {e}")
            
            # Get KOFAM metagenome domains if available
            if hasattr(self, 'kofam_metagenome_map'):
                try:
                    kofam_meta_domains = self.kofam_metagenome_map.get(str(gene), [])
                    if not isinstance(kofam_meta_domains, list):
                        kofam_meta_domains = []
                        
                    for domain in kofam_meta_domains:
                        if not isinstance(domain, dict) or 'hmm_name' not in domain:
                            continue
                        
                        domain_name = domain['hmm_name']
                        # Add a prefix to avoid collisions with better binders domains
                        domain_name = "META_" + domain_name
                        
                        if domain_name not in kofam_domain_counts:
                            kofam_domain_counts[domain_name] = {
                                'count': 0, 
                                'genes': [],
                                'e_values': [],
                                'bitscores': [],
                                'is_metagenome': True
                            }
                        
                        kofam_domain_counts[domain_name]['count'] += 1
                        kofam_domain_counts[domain_name]['genes'].append(gene)
                        kofam_domain_counts[domain_name]['e_values'].append(domain.get('e_value', 1.0))
                        kofam_domain_counts[domain_name]['bitscores'].append(domain.get('bitscore', 0.0))
                        
                except Exception as e:
                    print(f"Error processing KOFAM metagenome domains for cancer {cancer_acc}, gene {gene}: {e}")
        
        # Get binding affinity statistics
        try:
            binding_data = cancer_rows.to_dict(orient='records')
            
            # Calculate binding affinity statistics
            binding_affinities = []
            for binding in binding_data:
                if 'mimic_Aff(nM)' in binding:
                    try:
                        aff = float(binding['mimic_Aff(nM)'])
                        if not pd.isna(aff) and not pd.isinf(aff) and aff > 0:
                            binding_affinities.append(aff)
                    except (ValueError, TypeError):
                        continue
                        
            # Calculate statistics if we have data
            if binding_affinities:
                affinity_stats = {
                    'min': min(binding_affinities),
                    'max': max(binding_affinities),
                    'mean': sum(binding_affinities) / len(binding_affinities),
                    'median': sorted(binding_affinities)[len(binding_affinities) // 2],
                    'count': len(binding_affinities),
                    'data': binding_affinities
                }
            else:
                affinity_stats = {
                    'min': 0,
                    'max': 0,
                    'mean': 0,
                    'median': 0,
                    'count': 0,
                    'data': []
                }
                
            # Count binding levels
            binding_levels = {}
            for binding in binding_data:
                level = binding.get('mimic_BindLevel', 'Unknown')
                if not isinstance(level, str):
                    level = str(level)
                
                if level not in binding_levels:
                    binding_levels[level] = 0
                binding_levels[level] += 1
                
        except Exception as e:
            print(f"Error processing binding data for cancer {cancer_acc}: {e}")
            binding_data = []
            affinity_stats = {
                'min': 0,
                'max': 0,
                'mean': 0,
                'median': 0,
                'count': 0,
                'data': []
            }
            binding_levels = {}
        
        # Get global domain frequencies for comparison
        print(f"DEBUG: Fetching global domain frequencies for cancer {cancer_acc}")
        global_freqs = self.get_global_domain_frequencies()
        
        # Calculate domain enrichment (comparing cancer-specific domains to global frequencies)
        pfam_enrichment = []
        
        # Total number of PFAM domains in cancer
        total_cancer_pfam = sum(data['count'] for data in pfam_domain_counts.values() 
                               if not data.get('is_metagenome', False))
        
        # Total number of PFAM domains globally
        total_global_pfam = sum(global_freqs['pfam_better_binders'].values())
        
        print(f"DEBUG: Computing domain enrichment for cancer {cancer_acc}")
        print(f"DEBUG: Total PFAM domains in cancer: {total_cancer_pfam}")
        print(f"DEBUG: Total PFAM domains globally: {total_global_pfam}")
        print(f"DEBUG: Number of PFAM domains to analyze: {sum(1 for d in pfam_domain_counts.items() if not d[1].get('is_metagenome', False))}")
        
        # Calculate enrichment for each PFAM domain
        for domain_name, data in pfam_domain_counts.items():
            # Skip metagenome domains
            if data.get('is_metagenome', False):
                print(f"DEBUG: Skipping metagenome domain {domain_name}")
                continue
                
            # Get global frequency
            global_count = global_freqs['pfam_better_binders'].get(domain_name, 0)
            
            print(f"DEBUG: Processing domain {domain_name} - cancer count: {data['count']}, global count: {global_count}")
            
            try:
                # Always add enrichment data, even if we can't calculate a meaningful fold change
                # This ensures we have at least some data in the enrichment array
                
                # First, make sure we have all the required data for the record
                if not isinstance(data.get('genes', None), list):
                    print(f"DEBUG: Fixing genes data for {domain_name}")
                    data['genes'] = []
                
                if not isinstance(data.get('e_values', None), list):
                    print(f"DEBUG: Fixing e_values data for {domain_name}")
                    data['e_values'] = []
                
                if not isinstance(data.get('bitscores', None), list):
                    print(f"DEBUG: Fixing bitscores data for {domain_name}")
                    data['bitscores'] = []
                
                enrichment_data = {
                    'domain': domain_name,
                    'cancer_count': data['count'],
                    'global_count': global_count,
                    'cancer_fraction': 0,
                    'global_fraction': 0,
                    'enrichment': 1.0,  # Default to no enrichment
                    'genes': data['genes'],
                    'e_values': data['e_values'],
                    'bitscores': data['bitscores']
                }
                
                # Calculate enrichment score (fold change) if possible
                if global_count > 0 and total_global_pfam > 0 and total_cancer_pfam > 0:
                    # Calculate fractions
                    cancer_fraction = data['count'] / total_cancer_pfam
                    global_fraction = global_count / total_global_pfam
                    
                    # Calculate enrichment (fold change)
                    if global_fraction > 0:
                        enrichment = cancer_fraction / global_fraction
                    else:
                        enrichment = float('inf')
                    
                    # Update the enrichment data
                    enrichment_data.update({
                        'cancer_fraction': cancer_fraction,
                        'global_fraction': global_fraction,
                        'enrichment': enrichment
                    })
                else:
                    print(f"DEBUG: Using default enrichment values for {domain_name} - insufficient data")
            except Exception as e:
                print(f"DEBUG: Error creating enrichment data for {domain_name}: {e}")
                # Create a safe fallback enrichment record
                enrichment_data = {
                    'domain': domain_name,
                    'cancer_count': data.get('count', 0),
                    'global_count': global_count,
                    'cancer_fraction': 0,
                    'global_fraction': 0,
                    'enrichment': 1.0,
                    'genes': [],
                    'e_values': [],
                    'bitscores': []
                }
            
            # Add to enrichment data
            pfam_enrichment.append(enrichment_data)
        
        print(f"DEBUG: Generated {len(pfam_enrichment)} enrichment records for cancer {cancer_acc}")
        if pfam_enrichment:
            print(f"DEBUG: First enrichment record: {pfam_enrichment[0]}")
        
        # Sort domains by enrichment score
        pfam_enrichment.sort(key=lambda x: x['enrichment'], reverse=True)
        
        # Sort domains by frequency
        sorted_pfam = sorted(
            [{'domain': domain, **data} for domain, data in pfam_domain_counts.items()],
            key=lambda x: x['count'],
            reverse=True
        )
        
        sorted_kofam = sorted(
            [{'domain': domain, **data} for domain, data in kofam_domain_counts.items()],
            key=lambda x: x['count'],
            reverse=True
        )
        
        # Basic information
        basic_info = {
            'Cancer Accession': cancer_acc,
            'Cancer Database': first_row.get('cancer_DB', 'N/A'),
            'Associated Mimic Genes': len(mimic_genes),
            'MHC Types': len(mhc_alleles),
            'PFAM Domains': len(pfam_domain_counts),
            'KOFAM Domains': len(kofam_domain_counts),
            'Binding Records': len(binding_data)
        }
        
        return {
            'cancer_acc': cancer_acc,
            'basic_info': basic_info,
            'mimic_genes': mimic_genes,
            'mhc_alleles': mhc_alleles,
            'pfam_domains': sorted_pfam,
            'kofam_domains': sorted_kofam,
            'pfam_enrichment': pfam_enrichment, # New enrichment data
            'binding_data': binding_data,
            'affinity_stats': affinity_stats,
            'binding_levels': binding_levels,
            'raw_data': first_row
        }
        
    def get_domain_enrichment_data(self):
        """
        Calculate comprehensive domain enrichment data comparing better binders with metagenome.
        
        Returns:
            dict: Dictionary containing PFAM and KOFAM enrichment and depletion data
        """
        print("Generating comprehensive domain enrichment data...")
        
        if self.merged_data is None:
            raise ValueError("Merged data not created. Call merge_data() first.")
            
        # Get better binder sequences
        better_binder_sequences = set(self.merged_data['mimic_gene'].unique())
        print(f"Found {len(better_binder_sequences)} better binder sequences")
        
        # Get all sequences that have PFAM or KOFAM annotations in metagenome
        all_metagenome_sequences = set()
        
        # If we have PFAM metagenome data, extract all sequence IDs
        if hasattr(self, 'pfam_metagenome_map'):
            all_metagenome_sequences.update(self.pfam_metagenome_map.keys())
                
        # If we have KOFAM metagenome data, extract all sequence IDs
        if hasattr(self, 'kofam_metagenome_map'):
            all_metagenome_sequences.update(self.kofam_metagenome_map.keys())
        
        print(f"Found {len(all_metagenome_sequences)} total sequences in metagenome")
        
        # Calculate global domain frequencies
        binder_domain_data = self._calculate_domain_frequencies(
            better_binder_sequences, 
            self.pfam_map, 
            self.kofam_map
        )
        
        # Calculate metagenome domain frequencies (excluding binder domains to avoid duplication)
        non_binder_sequences = all_metagenome_sequences - better_binder_sequences
        metagenome_domain_data = self._calculate_domain_frequencies(
            non_binder_sequences,
            self.pfam_metagenome_map,
            self.kofam_metagenome_map
        )
        
        print(f"Calculated domain frequencies for {len(non_binder_sequences)} non-binder sequences")
        
        # Calculate enrichment for PFAM domains
        pfam_enrichment, pfam_depletion, pfam_exclusive = self._calculate_domain_enrichment(
            binder_domain_data['pfam_counts'],
            binder_domain_data['total_pfam'],
            metagenome_domain_data['pfam_counts'],
            metagenome_domain_data['total_pfam'],
            binder_domain_data['pfam_details']
        )
        
        # Calculate enrichment for KOFAM domains
        kofam_enrichment, kofam_depletion, kofam_exclusive = self._calculate_domain_enrichment(
            binder_domain_data['kofam_counts'],
            binder_domain_data['total_kofam'],
            metagenome_domain_data['kofam_counts'],
            metagenome_domain_data['total_kofam'],
            binder_domain_data['kofam_details']
        )
        
        # Prepare detailed PFAM domain data (for tables and charts)
        pfam_domains = self._prepare_domain_details(
            binder_domain_data['pfam_details']
        )
        
        # Prepare detailed KOFAM domain data (for tables and charts)
        kofam_domains = self._prepare_domain_details(
            binder_domain_data['kofam_details']
        )
        
        # Create all enrichment data for tables
        all_enrichment_data = []
        
        # Add PFAM enrichment data with domain type
        for domain in pfam_enrichment:
            domain_data = domain.copy()
            domain_data['domain_type'] = 'PFAM'
            domain_data['status'] = 'Enriched'
            all_enrichment_data.append(domain_data)
            
        # Add PFAM depletion data with domain type
        for domain in pfam_depletion:
            domain_data = domain.copy()
            domain_data['domain_type'] = 'PFAM'
            domain_data['status'] = 'Depleted'
            all_enrichment_data.append(domain_data)
            
        # Add PFAM exclusive data with domain type
        for domain in pfam_exclusive:
            domain_data = domain.copy()
            domain_data['domain_type'] = 'PFAM'
            domain_data['status'] = 'Exclusive'
            all_enrichment_data.append(domain_data)
            
        # Add KOFAM enrichment data with domain type
        for domain in kofam_enrichment:
            domain_data = domain.copy()
            domain_data['domain_type'] = 'KOFAM'
            domain_data['status'] = 'Enriched'
            all_enrichment_data.append(domain_data)
            
        # Add KOFAM depletion data with domain type
        for domain in kofam_depletion:
            domain_data = domain.copy()
            domain_data['domain_type'] = 'KOFAM'
            domain_data['status'] = 'Depleted'
            all_enrichment_data.append(domain_data)
            
        # Add KOFAM exclusive data with domain type
        for domain in kofam_exclusive:
            domain_data = domain.copy()
            domain_data['domain_type'] = 'KOFAM'
            domain_data['status'] = 'Exclusive'
            all_enrichment_data.append(domain_data)
        
        # Summary statistics
        statistics = {
            'better_binder_count': len(better_binder_sequences),
            'metagenome_count': len(non_binder_sequences),
            'total_sequence_count': len(all_metagenome_sequences),
            'pfam_domains': {
                'better_binder': {
                    'unique_domains': len(binder_domain_data['pfam_counts']),
                    'total_occurrences': binder_domain_data['total_pfam']
                },
                'metagenome': {
                    'unique_domains': len(metagenome_domain_data['pfam_counts']),
                    'total_occurrences': metagenome_domain_data['total_pfam']
                },
                'enriched': len(pfam_enrichment),
                'depleted': len(pfam_depletion),
                'exclusive': len(pfam_exclusive)
            },
            'kofam_domains': {
                'better_binder': {
                    'unique_domains': len(binder_domain_data['kofam_counts']),
                    'total_occurrences': binder_domain_data['total_kofam']
                },
                'metagenome': {
                    'unique_domains': len(metagenome_domain_data['kofam_counts']),
                    'total_occurrences': metagenome_domain_data['total_kofam']
                },
                'enriched': len(kofam_enrichment),
                'depleted': len(kofam_depletion),
                'exclusive': len(kofam_exclusive)
            }
        }
        
        # Return all data
        return {
            'pfam_enrichment': pfam_enrichment,
            'kofam_enrichment': kofam_enrichment,
            'pfam_depletion': pfam_depletion,
            'kofam_depletion': kofam_depletion,
            'pfam_exclusive': pfam_exclusive,
            'kofam_exclusive': kofam_exclusive,
            'pfam_domains': pfam_domains,
            'kofam_domains': kofam_domains,
            'all_enrichment_data': all_enrichment_data,
            'statistics': statistics
        }
    
    def _calculate_domain_frequencies(self, sequence_ids, pfam_map, kofam_map):
        """
        Calculate domain frequencies for a given set of sequences.
        
        Args:
            sequence_ids (set): Set of sequence IDs to analyze
            pfam_map (dict): Mapping of sequence IDs to PFAM domains
            kofam_map (dict): Mapping of sequence IDs to KOFAM domains
            
        Returns:
            dict: Dictionary with domain frequency data
        """
        # Domain counters
        pfam_counts = {}
        kofam_counts = {}
        
        # Domain details for visualization 
        pfam_details = {}
        kofam_details = {}
        
        # Track total domain counts
        total_pfam = 0
        total_kofam = 0
        
        # Calculate domain frequencies
        for seq_id in sequence_ids:
            # Process PFAM domains if available
            if pfam_map and str(seq_id) in pfam_map:
                pfam_domains = pfam_map[str(seq_id)]
                
                if isinstance(pfam_domains, list):
                    for domain in pfam_domains:
                        if isinstance(domain, dict) and 'hmm_name' in domain:
                            domain_name = domain['hmm_name']
                            
                            # Increment counter
                            if domain_name not in pfam_counts:
                                pfam_counts[domain_name] = 0
                                pfam_details[domain_name] = {
                                    'genes': set(),
                                    'bitscores': [],
                                    'e_values': []
                                }
                            
                            pfam_counts[domain_name] += 1
                            total_pfam += 1
                            
                            # Store details
                            pfam_details[domain_name]['genes'].add(str(seq_id))
                            
                            if 'bitscore' in domain:
                                pfam_details[domain_name]['bitscores'].append(domain['bitscore'])
                            
                            if 'e_value' in domain:
                                pfam_details[domain_name]['e_values'].append(domain['e_value'])
            
            # Process KOFAM domains if available
            if kofam_map and str(seq_id) in kofam_map:
                kofam_domains = kofam_map[str(seq_id)]
                
                if isinstance(kofam_domains, list):
                    for domain in kofam_domains:
                        if isinstance(domain, dict) and 'hmm_name' in domain:
                            domain_name = domain['hmm_name']
                            
                            # Increment counter
                            if domain_name not in kofam_counts:
                                kofam_counts[domain_name] = 0
                                kofam_details[domain_name] = {
                                    'genes': set(),
                                    'bitscores': [],
                                    'e_values': []
                                }
                            
                            kofam_counts[domain_name] += 1
                            total_kofam += 1
                            
                            # Store details
                            kofam_details[domain_name]['genes'].add(str(seq_id))
                            
                            if 'bitscore' in domain:
                                kofam_details[domain_name]['bitscores'].append(domain['bitscore'])
                            
                            if 'e_value' in domain:
                                kofam_details[domain_name]['e_values'].append(domain['e_value'])
        
        return {
            'pfam_counts': pfam_counts,
            'kofam_counts': kofam_counts,
            'pfam_details': pfam_details,
            'kofam_details': kofam_details,
            'total_pfam': total_pfam,
            'total_kofam': total_kofam
        }
    
    def _calculate_domain_enrichment(self, target_counts, target_total, background_counts, background_total, domain_details=None):
        """
        Calculate domain enrichment comparing target vs background frequencies.
        
        Args:
            target_counts (dict): Domain counts in target dataset
            target_total (int): Total domain count in target dataset
            background_counts (dict): Domain counts in background dataset
            background_total (int): Total domain count in background dataset
            domain_details (dict, optional): Additional domain details for enrichment data
            
        Returns:
            tuple: (enriched domains, depleted domains, exclusive domains)
        """
        # Lists to store enriched, depleted, and exclusive domains
        enriched = []
        depleted = []
        exclusive = []
        
        # Make sure we have data to compare
        if target_total == 0 or background_total == 0:
            print(f"WARNING: Missing data for enrichment calculation. Target: {target_total}, Background: {background_total}")
            return enriched, depleted, exclusive
        
        # Calculate enrichment for each domain in target
        for domain, count in target_counts.items():
            # Skip domains with no counts
            if count == 0:
                continue
                
            try:
                # Calculate fractions
                target_fraction = count / target_total
                
                # Get background count (0 if not present)
                background_count = background_counts.get(domain, 0)
                
                # Get additional domain details if available
                additional_details = {}
                if domain_details and domain in domain_details:
                    # Add gene count and gene list
                    additional_details['gene_count'] = len(domain_details[domain]['genes'])
                    additional_details['genes'] = list(domain_details[domain]['genes'])
                
                # Calculate enrichment
                if background_count > 0:
                    background_fraction = background_count / background_total
                    enrichment = target_fraction / background_fraction
                    
                    # Create enrichment data
                    enrichment_data = {
                        'domain': domain,
                        'target_count': count,
                        'background_count': background_count,
                        'target_fraction': target_fraction,
                        'background_fraction': background_fraction,
                        'enrichment': enrichment,
                        **additional_details
                    }
                    
                    # Add to appropriate list
                    if enrichment >= 1.0:
                        enriched.append(enrichment_data)
                    else:
                        depleted.append(enrichment_data)
                else:
                    # Exclusive to target dataset (infinite enrichment)
                    enrichment_data = {
                        'domain': domain,
                        'target_count': count,
                        'background_count': 0,
                        'target_fraction': target_fraction,
                        'background_fraction': 0,
                        'enrichment': float('inf'),
                        **additional_details
                    }
                    
                    # Add to exclusive list
                    exclusive.append(enrichment_data)
                    
            except Exception as e:
                print(f"Error calculating enrichment for domain {domain}: {e}")
        
        # Sort enriched domains by enrichment (descending)
        enriched.sort(key=lambda x: x['enrichment'], reverse=True)
        
        # Sort depleted domains by enrichment (ascending)
        depleted.sort(key=lambda x: x['enrichment'])
        
        # Sort exclusive domains by target count (descending)
        exclusive.sort(key=lambda x: x['target_count'], reverse=True)
        
        return enriched, depleted, exclusive
    
    def _prepare_domain_details(self, domain_details):
        """
        Prepare domain details for visualization.
        
        Args:
            domain_details (dict): Raw domain details
            
        Returns:
            list: List of domain details ready for visualization
        """
        result = []
        
        for domain, details in domain_details.items():
            try:
                # Convert gene set to list
                gene_list = list(details['genes'])
                
                # Calculate average bitscore and e-value
                avg_bitscore = sum(details['bitscores']) / len(details['bitscores']) if details['bitscores'] else 0
                avg_evalue = sum(details['e_values']) / len(details['e_values']) if details['e_values'] else 1.0
                
                # Create domain data
                domain_data = {
                    'domain': domain,
                    'count': len(details['genes']),
                    'genes': gene_list,
                    'bitscores': details['bitscores'],
                    'e_values': details['e_values'],
                    'avg_bitscore': avg_bitscore,
                    'avg_evalue': avg_evalue
                }
                
                result.append(domain_data)
                
            except Exception as e:
                print(f"Error preparing domain details for {domain}: {e}")
        
        # Sort by count (descending)
        result.sort(key=lambda x: x['count'], reverse=True)
        
        return result
    
    def find_related_sequences(self, sequence_id, limit=5):
        """
        Find sequences related to the given sequence ID based on shared domains.
        
        Args:
            sequence_id (str): The sequence ID to find related sequences for
            limit (int): Maximum number of related sequences to return
            
        Returns:
            list: List of related sequence IDs
        """
        if self.merged_data is None:
            raise ValueError("Merged data not created. Call merge_data() first.")
            
        # Get better binders domains for this sequence - with robust error handling
        try:
            pfam_domains = self.pfam_map.get(str(sequence_id), [])
            if not isinstance(pfam_domains, list):
                print(f"Warning: PFAM domains for {sequence_id} is not a list: {type(pfam_domains)}")
                pfam_domains = []
        except Exception as e:
            print(f"Error accessing PFAM domains for {sequence_id}: {e}")
            pfam_domains = []
            
        try:
            kofam_domains = self.kofam_map.get(str(sequence_id), [])
            if not isinstance(kofam_domains, list):
                print(f"Warning: KOFAM domains for {sequence_id} is not a list: {type(kofam_domains)}")
                kofam_domains = []
        except Exception as e:
            print(f"Error accessing KOFAM domains for {sequence_id}: {e}")
            kofam_domains = []
            
        # Get metagenome domains for this sequence if available
        pfam_metagenome_domains = []
        if hasattr(self, 'pfam_metagenome_map'):
            try:
                pfam_metagenome_domains = self.pfam_metagenome_map.get(str(sequence_id), [])
                if not isinstance(pfam_metagenome_domains, list):
                    print(f"Warning: PFAM metagenome domains for {sequence_id} is not a list: {type(pfam_metagenome_domains)}")
                    pfam_metagenome_domains = []
            except Exception as e:
                print(f"Error accessing PFAM metagenome domains for {sequence_id}: {e}")
                pfam_metagenome_domains = []
            
        kofam_metagenome_domains = []
        if hasattr(self, 'kofam_metagenome_map'):
            try:
                kofam_metagenome_domains = self.kofam_metagenome_map.get(str(sequence_id), [])
                if not isinstance(kofam_metagenome_domains, list):
                    print(f"Warning: KOFAM metagenome domains for {sequence_id} is not a list: {type(kofam_metagenome_domains)}")
                    kofam_metagenome_domains = []
            except Exception as e:
                print(f"Error accessing KOFAM metagenome domains for {sequence_id}: {e}")
                kofam_metagenome_domains = []
                
        # Extract domain names
        pfam_names = set(d['hmm_name'] for d in pfam_domains if isinstance(d, dict) and 'hmm_name' in d)
        kofam_names = set(d['hmm_name'] for d in kofam_domains if isinstance(d, dict) and 'hmm_name' in d)
        pfam_metagenome_names = set(d['hmm_name'] for d in pfam_metagenome_domains if isinstance(d, dict) and 'hmm_name' in d)
        kofam_metagenome_names = set(d['hmm_name'] for d in kofam_metagenome_domains if isinstance(d, dict) and 'hmm_name' in d)
        
        # If no domains to compare, return empty list
        if not pfam_names and not kofam_names and not pfam_metagenome_names and not kofam_metagenome_names:
            return []
            
        # Find sequences with similar domains
        related_scores = {}
        
        # Check all sequences
        for seq_id in self.merged_data['mimic_gene'].unique():
            if str(seq_id) == str(sequence_id):
                continue  # Skip self
                
            score = 0
            
            # Get better binders domains for the other sequence
            try:
                other_pfam_domains = self.pfam_map.get(str(seq_id), [])
                if not isinstance(other_pfam_domains, list):
                    other_pfam_domains = []
            except Exception as e:
                print(f"Error accessing PFAM domains for related sequence {seq_id}: {e}")
                other_pfam_domains = []
                
            try:
                other_kofam_domains = self.kofam_map.get(str(seq_id), [])
                if not isinstance(other_kofam_domains, list):
                    other_kofam_domains = []
            except Exception as e:
                print(f"Error accessing KOFAM domains for related sequence {seq_id}: {e}")
                other_kofam_domains = []
            
            # Get metagenome domains for the other sequence if available
            other_pfam_metagenome_domains = []
            if hasattr(self, 'pfam_metagenome_map'):
                try:
                    other_pfam_metagenome_domains = self.pfam_metagenome_map.get(str(seq_id), [])
                    if not isinstance(other_pfam_metagenome_domains, list):
                        other_pfam_metagenome_domains = []
                except Exception as e:
                    print(f"Error accessing PFAM metagenome domains for related sequence {seq_id}: {e}")
                    other_pfam_metagenome_domains = []
                
            other_kofam_metagenome_domains = []
            if hasattr(self, 'kofam_metagenome_map'):
                try:
                    other_kofam_metagenome_domains = self.kofam_metagenome_map.get(str(seq_id), [])
                    if not isinstance(other_kofam_metagenome_domains, list):
                        other_kofam_metagenome_domains = []
                except Exception as e:
                    print(f"Error accessing KOFAM metagenome domains for related sequence {seq_id}: {e}")
                    other_kofam_metagenome_domains = []
            
            # Check PFAM better binders domains (weight higher)
            try:
                other_pfam = set(d['hmm_name'] for d in other_pfam_domains if isinstance(d, dict) and 'hmm_name' in d)
                pfam_overlap = pfam_names.intersection(other_pfam)
                score += len(pfam_overlap) * 3  # Highest weight for PFAM better binders
            except Exception as e:
                print(f"Error processing PFAM overlaps for {seq_id}: {e}")
            
            # Check KOFAM better binders domains
            try:
                other_kofam = set(d['hmm_name'] for d in other_kofam_domains if isinstance(d, dict) and 'hmm_name' in d)
                kofam_overlap = kofam_names.intersection(other_kofam)
                score += len(kofam_overlap) * 2  # Medium weight for KOFAM better binders
            except Exception as e:
                print(f"Error processing KOFAM overlaps for {seq_id}: {e}")
                
            # Check PFAM metagenome domains
            if pfam_metagenome_names and other_pfam_metagenome_domains:
                try:
                    other_pfam_meta = set(d['hmm_name'] for d in other_pfam_metagenome_domains if isinstance(d, dict) and 'hmm_name' in d)
                    pfam_meta_overlap = pfam_metagenome_names.intersection(other_pfam_meta)
                    score += len(pfam_meta_overlap) * 1.5  # Lower weight for metagenome domains
                except Exception as e:
                    print(f"Error processing PFAM metagenome overlaps for {seq_id}: {e}")
            
            # Check KOFAM metagenome domains
            if kofam_metagenome_names and other_kofam_metagenome_domains:
                try:
                    other_kofam_meta = set(d['hmm_name'] for d in other_kofam_metagenome_domains if isinstance(d, dict) and 'hmm_name' in d)
                    kofam_meta_overlap = kofam_metagenome_names.intersection(other_kofam_meta)
                    score += len(kofam_meta_overlap)  # Lowest weight for KOFAM metagenome
                except Exception as e:
                    print(f"Error processing KOFAM metagenome overlaps for {seq_id}: {e}")
            
            if score > 0:
                related_scores[seq_id] = score
        
        # Sort by score and return top matches
        related = sorted(related_scores.items(), key=lambda x: x[1], reverse=True)
        return [{'id': id, 'score': score} for id, score in related[:limit]]

# Example usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python data_processor.py [data_directory]")
        sys.exit(1)
        
    data_dir = sys.argv[1]
    
    processor = MimicDataProcessor(data_dir)
    processor.load_data()
    processor.process_hmm_hits()
    processor.merge_data()
    
    # Print data summary
    summary = processor.get_data_summary()
    print("\nData Summary:")
    print(json.dumps(summary, indent=2))
    
    # Save processed data
    processor.save_processed_data()
