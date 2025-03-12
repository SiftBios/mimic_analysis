# Domain Enrichment Analysis

## Overview

Domain enrichment analysis compares the frequency of protein domains in mimic-bearing sequences (those containing MHC-I binding peptides) with their frequency in the background metagenome. This comparison helps identify which domains are overrepresented or underrepresented in proteins that can generate potential mimics of host epitopes.

## Methodology

For each domain, we calculate the enrichment factor using the following formula:

```
Enrichment = (Domain count in mimic proteins / Total domains in mimic proteins) / 
            (Domain count in metagenome / Total domains in metagenome)
```

This calculation results in a fold-change value that indicates how much more frequently (or less frequently) a domain appears in mimic-bearing proteins compared to the background.

## Interpretation

- **Enrichment > 1**: The domain is overrepresented in mimic-bearing proteins
  - Higher values indicate stronger enrichment
  - Domains with high enrichment may play important roles in generating MHC-binding peptides
  
- **Enrichment = 1**: The domain occurs at the same frequency in both datasets
  - Neither enriched nor depleted

- **Enrichment < 1**: The domain is underrepresented in mimic-bearing proteins
  - Lower values indicate stronger depletion
  - Domains with low enrichment may be associated with proteins less likely to generate MHC-binding peptides

- **Enrichment = ∞**: The domain only appears in mimic-bearing proteins
  - These domains are exclusive to mimic-bearing sequences in the dataset

## Biological Significance

### Enriched Domains

Domains with high enrichment values may:

1. Generate peptides with sequences similar to host epitopes
2. Contain regions that are more accessible to the proteasome
3. Have structural features that facilitate MHC binding
4. Play roles in host-microbe interactions
5. Be involved in molecular mimicry mechanisms

### Depleted Domains

Domains with low enrichment values may:

1. Have structural properties that protect against proteasomal degradation
2. Lack sequences that can bind to MHC molecules
3. Be involved in functions unrelated to host-microbe interactions
4. Be less immunogenic in general

## Limitations

Several factors can affect the interpretation of enrichment values:

1. **Sample size**: Domains that appear infrequently may show extreme enrichment or depletion values by chance
2. **Data completeness**: Missing annotations can skew the analysis
3. **Domain context**: The analysis doesn't account for the context of domains within proteins
4. **Binding prediction accuracy**: The initial MHC binding predictions have their own error rates

## Usage Recommendations

- **Focus on high-confidence domains**: Filter by minimum bitscore and maximum e-value
- **Consider domain frequency**: Domains that appear more frequently provide more reliable enrichment estimates
- **Look for patterns**: Related domains showing similar enrichment patterns provide stronger evidence
- **Validate with literature**: Check if enriched domains have known roles in antigen presentation or immune evasion

## Technical Implementation

The domain enrichment analysis in this tool:

1. Extracts domain annotations from both mimic-bearing proteins and the global metagenome
2. Calculates frequencies and enrichment factors for each domain
3. Provides visualizations for enriched and depleted domains
4. Allows filtering based on various statistical thresholds
5. Provides detailed information for each domain for further investigation

## References

For more information on protein domain analysis and enrichment studies, see:

1. Finn, R.D., et al. (2016). "The Pfam protein families database: towards a more sustainable future." *Nucleic Acids Research*, 44(D1), D279-D285.
2. Kanehisa, M., et al. (2017). "KEGG: new perspectives on genomes, pathways, diseases and drugs." *Nucleic Acids Research*, 45(D1), D353-D361.
3. Young, J.M., et al. (2020). "Microbiome and Human Immunity: Methods and Mechanisms of Molecular Mimicry." *Frontiers in Immunology*, 11, 2187.