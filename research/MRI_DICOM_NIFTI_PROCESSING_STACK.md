# MRI DICOM/NIfTI Processing Stack: The Definitive Guide

> **Document Type:** Technical Reference Guide
> **Target Audience:** Clinical MRI Researchers, Medical Imaging Informaticists, Neuroimaging Pipeline Engineers
> **Scope:** DICOM/NIfTI I/O, metadata extraction, PHI de-identification, spatial transforms, template management, and quality assurance for clinical MRI workflows
> **Last Updated:** 2025-07-08
> **Version:** 1.0.0

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [DICOM Processing Toolkit](#2-dicom-processing-toolkit)
   - 2.1 [pydicom](#21-pydicom)
   - 2.2 [SimpleITK](#22-simpleitk)
   - 2.3 [dicognito](#23-dicognito)
   - 2.4 [dicomweb-client](#24-dicomweb-client)
   - 2.5 [orthanc-python](#25-orthanc-python)
   - 2.6 [highdicom](#26-highdicom)
3. [NIfTI Processing Toolkit](#3-nifti-processing-toolkit)
   - 3.1 [NiBabel](#31-nibabel)
   - 3.2 [nilearn](#32-nilearn)
   - 3.3 [nitransforms](#33-nitransforms)
   - 3.4 [templateflow](#34-templateflow)
   - 3.5 [pyBIDS](#35-pybids)
4. [Metadata & Quality Assurance](#4-metadata--quality-assurance)
   - 4.1 [DICOM Tag Extraction](#41-dicom-tag-extraction)
   - 4.2 [Series Organization](#42-series-organization)
   - 4.3 [Slice Ordering](#43-slice-ordering)
   - 4.4 [Orientation Detection](#44-orientation-detection)
   - 4.5 [Phantom QA](#45-phantom-qa)
5. [Integration Patterns](#5-integration-patterns)
6. [Pipeline Quick Reference](#6-pipeline-quick-reference)
7. [Appendix: Tool Comparison Matrix](#7-appendix-tool-comparison-matrix)

---

## 1. Overview & Architecture

### Clinical MRI Data Processing Landscape

Clinical MRI workflows require a sophisticated toolchain spanning multiple domains:

```
+------------------+    +------------------+    +------------------+
|   DICOM Sources   | -> |   Processing    | -> |  NIfTI Outputs   |
|                  |    |                  |    |                  |
| - PACS/VNA       |    | - Metadata QA    |    | - Analysis-ready |
| - DICOMweb       |    | - De-identify    |    | - BIDS datasets  |
| - Local Scanner  |    | - Convert/Resample|    | - Templates      |
| - Orthanc Server |    | - Transform      |    | - Statistics     |
+------------------+    +------------------+    +------------------+
         |                       |                       |
         v                       v                       v
+---------------------------------------------------------------+
|                    PYTHON PROCESSING STACK                     |
|                                                               |
|  DICOM Layer: pydicom | SimpleITK | dicognito | dicomweb     |
|  NIfTI Layer: nibabel | nilearn | nitransforms | templateflow |
|  Data Layer:  pyBIDS  | pandas  | numpy       | h5py         |
+---------------------------------------------------------------+
```

### Core Principles

1. **Data Provenance:** Every transformation must be traceable to its source DICOM StudyInstanceUID
2. **PHI Safety:** De-identification before any research use; audit all metadata fields
3. **Spatial Integrity:** Preserve affine transforms; never resample without updating headers
4. **Reproducibility:** Pin versions; use BIDS; document all parameters
5. **Clinical Alignment:** Results must be interpretable in standard neuroimaging templates (MNI152, fsaverage)

---

## 2. DICOM Processing Toolkit

### 2.1 pydicom

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/pydicom/pydicom |
| **License** | MIT |
| **PyPI** | https://pypi.org/project/pydicom/ |
| **Installation** | `pip install pydicom` |
| **Integration Complexity** | 1/5 (Minimal - pure Python) |
| **Clinical Relevance** | 5/5 (Essential for all DICOM I/O) |
| **Stars** | 1,900+ |

#### Overview

pydicom is the foundational Python library for reading, modifying, and writing DICOM files. It provides full access to DICOM metadata (tags), pixel data, and sequences. It is the **de facto standard** for DICOM manipulation in Python research workflows.

#### Installation

```bash
# Base installation
pip install pydicom

# With pixel data handlers (JPEG, JPEG2000)
pip install pydicom[libjpeg,openjpeg,gdcm]

# Complete stack for clinical work
pip install pydicom numpy pillow python-gdcm pylibjpeg pylibjpeg-libjpeg pylibjpeg-openjpeg
```

#### Clinical Code Examples

```python
"""
pydicom: Clinical MRI DICOM Reading & Tag Extraction
----------------------------------------------------
Purpose: Read DICOM files, extract MRI-relevant metadata,
         access pixel data, and prepare for NIfTI conversion.
"""

import pydicom
from pydicom import dcmread
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid
import numpy as np
from pathlib import Path
from datetime import datetime

# ============================================================
# 1. READING DICOM FILES
# ============================================================

def read_mri_dicom(filepath: str) -> Dataset:
    """Read a DICOM file with force=True for files without proper preamble."""
    ds = dcmread(filepath, force=True)
    return ds

# Read a single slice
filepath = "/path/to/mri/bravo/IM-0001-0001.dcm"
ds = read_mri_dicom(filepath)

# ============================================================
# 2. EXTRACTING MRI-SPECIFIC METADATA
# ============================================================

def extract_mri_metadata(ds: Dataset) -> dict:
    """
    Extract clinically relevant MRI parameters from DICOM headers.
    These are essential for sequence identification and analysis.
    """
    meta = {}
    
    # --- Patient & Study Information ---
    meta['patient_id'] = ds.get('PatientID', 'Unknown')
    meta['patient_age'] = ds.get('PatientAge', 'Unknown')
    meta['patient_sex'] = ds.get('PatientSex', 'Unknown')
    meta['study_date'] = ds.get('StudyDate', 'Unknown')
    meta['study_time'] = ds.get('StudyTime', 'Unknown')
    meta['study_instance_uid'] = ds.get('StudyInstanceUID', '')
    meta['study_description'] = ds.get('StudyDescription', '')
    meta['accession_number'] = ds.get('AccessionNumber', '')
    
    # --- Series Information ---
    meta['series_number'] = ds.get('SeriesNumber', 0)
    meta['series_description'] = ds.get('SeriesDescription', '')
    meta['series_instance_uid'] = ds.get('SeriesInstanceUID', '')
    meta['modality'] = ds.get('Modality', 'MR')
    
    # --- MRI Acquisition Parameters ---
    meta['manufacturer'] = ds.get('Manufacturer', '')
    meta['manufacturer_model_name'] = ds.get('ManufacturerModelName', '')
    meta['magnetic_field_strength'] = ds.get('MagneticFieldStrength', 0.0)  # Tesla
    meta['repetition_time'] = ds.get('RepetitionTime', 0.0)  # ms
    meta['echo_time'] = ds.get('EchoTime', 0.0)  # ms
    meta['inversion_time'] = ds.get('InversionTime', 0.0)  # ms
    meta['flip_angle'] = ds.get('FlipAngle', 0.0)  # degrees
    meta['slice_thickness'] = ds.get('SliceThickness', 0.0)  # mm
    meta['spacing_between_slices'] = ds.get('SpacingBetweenSlices', 0.0)
    meta['number_of_phase_encoding_steps'] = ds.get('NumberOfPhaseEncodingSteps', 0)
    meta['echo_train_length'] = ds.get('EchoTrainLength', 0)
    meta['percent_phase_field_of_view'] = ds.get('PercentPhaseFieldOfView', 0.0)
    
    # --- Image Geometry ---
    meta['rows'] = ds.get('Rows', 0)
    meta['columns'] = ds.get('Columns', 0)
    meta['pixel_spacing'] = list(ds.get('PixelSpacing', [0.0, 0.0]))
    meta['image_orientation_patient'] = list(ds.get('ImageOrientationPatient', [0.0]*6))
    meta['image_position_patient'] = list(ds.get('ImagePositionPatient', [0.0, 0.0, 0.0]))
    meta['slice_location'] = ds.get('SliceLocation', 0.0)
    
    # --- Sequence Identification ---
    meta['sequence_name'] = ds.get('SequenceName', '')
    meta['scanning_sequence'] = ds.get('ScanningSequence', '')
    meta['sequence_variant'] = ds.get('SequenceVariant', '')
    meta['mr_acquisition_type'] = ds.get('MRAcquisitionType', '')  # 2D or 3D
    meta['scan_options'] = ds.get('ScanOptions', '')
    meta['pulse_sequence_name'] = ds.get('PulseSequenceName', '')
    
    # --- SOP & Instance ---
    meta['sop_class_uid'] = ds.get('SOPClassUID', '')
    meta['sop_instance_uid'] = ds.get('SOPInstanceUID', '')
    meta['instance_number'] = ds.get('InstanceNumber', 0)
    
    return meta

# Usage
meta = extract_mri_metadata(ds)
print(f"Sequence: {meta['series_description']}")
print(f"TR/TE/TI: {meta['repetition_time']}/{meta['echo_time']}/{meta['inversion_time']}")
print(f"Field Strength: {meta['magnetic_field_strength']}T")

# ============================================================
# 3. ACCESSING PIXEL DATA
# ============================================================

def get_pixel_array(ds: Dataset, apply_modality_rescale: bool = True) -> np.ndarray:
    """
    Extract pixel array from DICOM. Optionally apply rescale slope/intercept
    to get actual intensity values.
    """
    # Read pixel data (handles compressed transfers automatically)
    pixel_array = ds.pixel_array
    
    if apply_modality_rescale:
        # Apply rescale slope and intercept for true intensity values
        slope = float(ds.get('RescaleSlope', 1))
        intercept = float(ds.get('RescaleIntercept', 0))
        pixel_array = pixel_array * slope + intercept
    
    return pixel_array

pixels = get_pixel_array(ds)
print(f"Pixel array shape: {pixels.shape}, dtype: {pixels.dtype}")
print(f"Intensity range: [{pixels.min():.2f}, {pixels.max():.2f}]")

# ============================================================
# 4. MODIFYING DICOM TAGS
# ============================================================

def update_series_description(ds: Dataset, new_description: str) -> Dataset:
    """Update series description for research anonymization."""
    ds.SeriesDescription = new_description
    ds.SeriesDescription = new_description[:64]  # DICOM max length
    return ds

def anonymize_patient_tags(ds: Dataset) -> Dataset:
    """
    Remove direct patient identifiers while keeping study context.
    This is a partial de-identification; use dicognito (Section 2.3)
    for HIPAA-compliant full de-identification.
    """
    tags_to_remove = [
        'PatientName', 'PatientBirthDate', 'PatientBirthTime',
        'PatientMotherBirthName', 'OtherPatientIDs',
        'OtherPatientNames', 'PatientAddress', 'PatientTelephoneNumbers',
        'PatientInsurancePlanCodeSequence', 'PerformingPhysicianName',
        'ReferringPhysicianName', 'ConsultingPhysicianName',
        'OperatorsName', 'AdmittingDiagnosesDescription',
        'StationName', 'DeviceSerialNumber',
    ]
    for tag in tags_to_remove:
        if tag in ds:
            delattr(ds, tag)
    return ds

# ============================================================
# 5. CREATING A NEW DICOM FILE
# ============================================================

def create_mri_dicom(
    pixel_array: np.ndarray,
    output_path: str,
    study_meta: dict,
    sop_instance_uid: str = None,
    sop_class_uid: str = '1.2.840.10008.5.1.4.1.1.4'  # MR Image Storage
) -> str:
    """
    Create a new DICOM MR Image file from a numpy array.
    Useful for saving processed images back to DICOM format.
    """
    rows, cols = pixel_array.shape
    
    # Create FileDataset
    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = sop_class_uid
    file_meta.MediaStorageSOPInstanceUID = sop_instance_uid or generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()
    
    ds = FileDataset(output_path, {}, file_meta=file_meta, preamble=b'\x00' * 128)
    
    # Patient info
    ds.PatientName = study_meta.get('patient_name', 'Anonymous')
    ds.PatientID = study_meta.get('patient_id', '0')
    ds.PatientBirthDate = ''
    ds.PatientSex = study_meta.get('patient_sex', 'O')
    
    # Study info
    ds.StudyDate = study_meta.get('study_date', datetime.now().strftime('%Y%m%d'))
    ds.StudyTime = study_meta.get('study_time', datetime.now().strftime('%H%M%S'))
    ds.StudyInstanceUID = study_meta.get('study_instance_uid', generate_uid())
    ds.StudyDescription = study_meta.get('study_description', 'Research MRI')
    ds.StudyID = '1'
    ds.AccessionNumber = ''
    ds.ReferringPhysicianName = ''
    
    # Series info
    ds.SeriesNumber = study_meta.get('series_number', 1)
    ds.SeriesDescription = study_meta.get('series_description', 'MRI Series')
    ds.SeriesInstanceUID = study_meta.get('series_instance_uid', generate_uid())
    ds.Modality = 'MR'
    
    # Image geometry
    ds.Rows = rows
    ds.Columns = cols
    ds.PixelSpacing = study_meta.get('pixel_spacing', [1.0, 1.0])
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = 'MONOCHROME2'
    ds.PixelRepresentation = 1  # Signed
    
    # Acquisition
    ds.RepetitionTime = study_meta.get('repetition_time', 0.0)
    ds.EchoTime = study_meta.get('echo_time', 0.0)
    ds.FlipAngle = study_meta.get('flip_angle', 0.0)
    ds.MagneticFieldStrength = study_meta.get('magnetic_field_strength', 3.0)
    
    # SOP info
    ds.SOPClassUID = sop_class_uid
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceNumber = study_meta.get('instance_number', 1)
    ds.ContentDate = ds.StudyDate
    ds.ContentTime = ds.StudyTime
    
    # Set pixel data
    ds.PixelData = pixel_array.astype(np.int16).tobytes()
    
    # Save
    ds.save_as(output_path)
    return output_path

# ============================================================
# 6. BATCH PROCESSING A DICOM DIRECTORY
# ============================================================

def scan_dicom_directory(directory: str) -> list[dict]:
    """
    Scan a directory for DICOM files and extract metadata for each.
    Returns sorted list by series and instance number.
    """
    dicom_files = []
    dir_path = Path(directory)
    
    for fpath in dir_path.rglob('*'):
        if fpath.is_file():
            try:
                ds = dcmread(str(fpath), force=True, stop_before_pixels=True)
                meta = {
                    'filepath': str(fpath),
                    'study_uid': ds.get('StudyInstanceUID', ''),
                    'series_uid': ds.get('SeriesInstanceUID', ''),
                    'series_number': int(ds.get('SeriesNumber', 0)),
                    'instance_number': int(ds.get('InstanceNumber', 0)),
                    'series_description': ds.get('SeriesDescription', ''),
                    'modality': ds.get('Modality', ''),
                    'rows': ds.get('Rows', 0),
                    'columns': ds.get('Columns', 0),
                }
                dicom_files.append(meta)
            except Exception as e:
                continue
    
    # Sort by series number, then instance number
    dicom_files.sort(key=lambda x: (x['series_number'], x['instance_number']))
    return dicom_files

# Usage
# dicom_list = scan_dicom_directory("/path/to/dicom/study/")
# series_groups = {}
# for d in dicom_list:
#     suid = d['series_uid']
#     if suid not in series_groups:
#         series_groups[suid] = []
#     series_groups[suid].append(d)
```

---

### 2.2 SimpleITK

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/SimpleITK/SimpleITK |
| **License** | Apache 2.0 |
| **PyPI** | https://pypi.org/project/SimpleITK/ |
| **Installation** | `pip install SimpleITK` |
| **Integration Complexity** | 2/5 (Low - clean Python bindings) |
| **Clinical Relevance** | 5/5 (Essential for registration/resampling) |
| **Stars** | 1,600+ |

#### Overview

SimpleITK is a simplified, object-oriented layer built on top of the Insight Toolkit (ITK). It provides powerful image processing capabilities including: registration, resampling, filtering, segmentation, and morphological operations. It is the **gold standard** for medical image processing in Python.

#### Installation

```bash
# Base installation
pip install SimpleITK

# With numpy/scipy integration
pip install SimpleITK numpy scipy matplotlib

# Build from source (for custom ITK builds)
pip install SimpleITK --no-binary SimpleITK
```

#### Clinical Code Examples

```python
"""
SimpleITK: Clinical MRI Processing Pipeline
-------------------------------------------
Purpose: Image reading, resampling, registration, N4 bias correction,
         and brain extraction for clinical MRI volumes.
"""

import SimpleITK as sitk
import numpy as np
from pathlib import Path
import json

# ============================================================
# 1. READING & WRITING IMAGES
# ============================================================

def read_image(filepath: str) -> sitk.Image:
    """Read any medical image format (DICOM, NIfTI, NRRD, etc.)."""
    image = sitk.ReadImage(filepath)
    return image

def write_image(image: sitk.Image, filepath: str, use_compression: bool = True):
    """Write image to file with optional compression."""
    writer = sitk.ImageFileWriter()
    writer.UseCompressionOn() if use_compression else writer.UseCompressionOff()
    writer.SetFileName(filepath)
    writer.Execute(image)

# Read DICOM series
reader = sitk.ImageSeriesReader()
dicom_names = reader.GetGDCMSeriesFileNames("/path/to/dicom/series/")
reader.SetFileNames(dicom_names)
volume = reader.Execute()

print(f"Volume size: {volume.GetSize()}")
print(f"Volume spacing: {volume.GetSpacing()}")
print(f"Volume origin: {volume.GetOrigin()}")
print(f"Volume direction: {volume.GetDirection()}")

# Read NIfTI
nii = sitk.ReadImage("/path/to/brain.nii.gz")

# ============================================================
# 2. IMAGE METADATA & PROPERTIES
# ============================================================

def extract_image_info(image: sitk.Image) -> dict:
    """Extract comprehensive image metadata."""
    info = {
        'size': image.GetSize(),
        'spacing': image.GetSpacing(),
        'origin': image.GetOrigin(),
        'direction': image.GetDirection(),
        'dimension': image.GetDimension(),
        'pixel_id': image.GetPixelID(),
        'pixel_id_type': sitk.GetPixelIDValueAsString(image.GetPixelID()),
        'number_of_components': image.GetNumberOfComponentsPerPixel(),
        'min_intensity': float(sitk.GetArrayFromImage(image).min()),
        'max_intensity': float(sitk.GetArrayFromImage(image).max()),
    }
    return info

# ============================================================
# 3. RESAMPLING TO STANDARD SPACE
# ============================================================

def resample_to_reference(
    image: sitk.Image,
    reference: sitk.Image,
    interpolator=sitk.sitkLinear,
    default_value: float = 0.0
) -> sitk.Image:
    """
    Resample an image to match a reference image's geometry.
    Essential for bringing images into template space.
    """
    resampler = sitk.ResampleImageFilter()
    resampler.SetReferenceImage(reference)
    resampler.SetInterpolator(interpolator)
    resampler.SetDefaultPixelValue(default_value)
    resampler.SetOutputPixelType(image.GetPixelID())
    return resampler.Execute(image)

def resample_to_spacing(
    image: sitk.Image,
    output_spacing: tuple = (1.0, 1.0, 1.0),
    interpolator=sitk.sitkLinear,
    default_value: float = 0.0
) -> sitk.Image:
    """
    Resample image to a specified isotropic spacing.
    Commonly used for isotropic resampling (e.g., 1x1x1 mm).
    """
    original_size = image.GetSize()
    original_spacing = image.GetSpacing()
    
    # Calculate new size maintaining physical extent
    output_size = [
        int(round(original_size[i] * (original_spacing[i] / output_spacing[i])))
        for i in range(3)
    ]
    
    resampler = sitk.ResampleImageFilter()
    resampler.SetOutputSpacing(output_spacing)
    resampler.SetSize(output_size)
    resampler.SetOutputDirection(image.GetDirection())
    resampler.SetOutputOrigin(image.GetOrigin())
    resampler.SetInterpolator(interpolator)
    resampler.SetDefaultPixelValue(default_value)
    resampler.SetOutputPixelType(image.GetPixelID())
    
    return resampler.Execute(image)

# Isotropic resampling to 1mm
iso_volume = resample_to_spacing(volume, output_spacing=(1.0, 1.0, 1.0))

# ============================================================
# 4. RIGID REGISTRATION (Patient to Template)
# ============================================================

def rigid_registration(
    fixed: sitk.Image,
    moving: sitk.Image,
    initial_transform: sitk.Transform = None,
    shrink_factors: list = [4, 2, 1],
    smoothing_sigmas: list = [2, 1, 0],
    metric_sampling_percentage: float = 0.05
) -> sitk.Transform:
    """
    Rigid (Euler3D) registration of moving image to fixed image.
    Multi-resolution registration with Mattes Mutual Information.
    
    Parameters:
    -----------
    fixed : sitk.Image
        Reference/target image (e.g., MNI152 template)
    moving : sitk.Image
        Image to be registered (e.g., patient T1w)
    shrink_factors : list
        Downsampling factors per resolution level
    smoothing_sigmas : list
        Gaussian smoothing sigma per resolution level
    metric_sampling_percentage : float
        Percentage of voxels to sample for metric calculation
    
    Returns:
    --------
    transform : sitk.Transform
        Computed rigid transform (Euler3D)
    """
    if initial_transform is None:
        # Centered transform initialization
        initial_transform = sitk.CenteredTransformInitializer(
            fixed,
            moving,
            sitk.Euler3DTransform(),
            sitk.CenteredTransformInitializerFilter.GEOMETRY
        )
    
    # Registration method
    registration = sitk.ImageRegistrationMethod()
    registration.SetMetricAsMattesMutualInformation(numberOfHistogramBins=128)
    registration.SetMetricSamplingStrategy(registration.RANDOM)
    registration.SetMetricSamplingPercentage(metric_sampling_percentage)
    registration.SetInterpolator(sitk.sitkLinear)
    
    # Optimizer
    registration.SetOptimizerAsGradientDescent(
        learningRate=1.0,
        numberOfIterations=200,
        convergenceMinimumValue=1e-6,
        convergenceWindowSize=10
    )
    registration.SetOptimizerScalesFromPhysicalShift()
    registration.SetInitialTransform(initial_transform)
    
    # Multi-resolution setup
    registration.SetShrinkFactorsPerLevel(shrink_factors)
    registration.SetSmoothingSigmasPerLevel(smoothing_sigmas)
    registration.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()
    
    # Execute
    final_transform = registration.Execute(fixed, moving)
    
    # Print metric value
    print(f"Final metric value: {registration.GetMetricValue()}")
    print(f"Optimizer stop condition: {registration.GetOptimizerStopConditionDescription()}")
    
    return final_transform

def affine_registration(
    fixed: sitk.Image,
    moving: sitk.Image,
    initial_transform: sitk.Transform = None,
    shrink_factors: list = [2, 1],
    smoothing_sigmas: list = [1, 0]
) -> sitk.Transform:
    """
    Affine (12-DOF) registration following rigid alignment.
    Used for final template alignment with scaling/shearing.
    """
    if initial_transform is None:
        initial_transform = sitk.CenteredTransformInitializer(
            fixed, moving, sitk.AffineTransform(3),
            sitk.CenteredTransformInitializerFilter.GEOMETRY
        )
    
    registration = sitk.ImageRegistrationMethod()
    registration.SetMetricAsMattesMutualInformation(numberOfHistogramBins=128)
    registration.SetMetricSamplingStrategy(registration.RANDOM)
    registration.SetMetricSamplingPercentage(0.05)
    registration.SetInterpolator(sitk.sitkLinear)
    registration.SetOptimizerAsGradientDescent(
        learningRate=1.0,
        numberOfIterations=200,
        convergenceMinimumValue=1e-6,
        convergenceWindowSize=10
    )
    registration.SetOptimizerScalesFromPhysicalShift()
    registration.SetInitialTransform(initial_transform)
    registration.SetShrinkFactorsPerLevel(shrink_factors)
    registration.SetSmoothingSigmasPerLevel(smoothing_sigmas)
    registration.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()
    
    return registration.Execute(fixed, moving)

# Clinical workflow: Rigid -> Affine pipeline
template = sitk.ReadImage("MNI152_T1_1mm.nii.gz")
patient_t1 = sitk.ReadImage("patient_T1w.nii.gz")

# Step 1: Rigid
rigid_transform = rigid_registration(template, patient_t1)

# Step 2: Affine (use rigid result as initialization)
rigid_resampled = sitk.Resample(
    patient_t1, template, rigid_transform,
    sitk.sitkLinear, 0.0, patient_t1.GetPixelID()
)
affine_transform = affine_registration(template, rigid_resampled)

# Step 3: Composite transform
composite = sitk.CompositeTransform([rigid_transform, affine_transform])
registered = sitk.Resample(patient_t1, template, composite, sitk.sitkLinear, 0.0)

# ============================================================
# 5. N4 BIAS FIELD CORRECTION
# ============================================================

def n4_bias_correction(
    image: sitk.Image,
    mask: sitk.Image = None,
    shrink_factor: int = 4,
    iterations: list = [50, 50, 50, 50],
    convergence_threshold: float = 1e-7
) -> sitk.Image:
    """
    N4ITK bias field correction for intensity inhomogeneity correction.
    Essential preprocessing step for MRI, especially at 3T.
    
    Parameters:
    -----------
    image : sitk.Image
        Input MR image (typically T1-weighted)
    mask : sitk.Image, optional
        Brain mask for masking background during correction
    shrink_factor : int
        Shrink factor for faster computation
    iterations : list
        Number of iterations per resolution level
    convergence_threshold : float
        Convergence threshold for optimization
    """
    # Shrink for speed
    if shrink_factor > 1:
        shrunk = sitk.Shrink(image, [shrink_factor]*3)
        if mask is not None:
            shrunk_mask = sitk.Shrink(mask, [shrink_factor]*3)
        else:
            # Otsu threshold for mask
            shrunk_mask = sitk.OtsuThreshold(shrunk, 0, 1, 200)
    else:
        shrunk = image
        if mask is not None:
            shrunk_mask = mask
        else:
            shrunk_mask = sitk.OtsuThreshold(shrunk, 0, 1, 200)
    
    corrector = sitk.N4BiasFieldCorrectionImageFilter()
    corrector.SetMaximumNumberOfIterations(iterations)
    corrector.SetConvergenceThreshold(convergence_threshold)
    
    corrected_shrunk = corrector.Execute(shrunk, shrunk_mask)
    
    # Reconstruct full-resolution bias field
    log_bias_field = corrector.GetLogBiasFieldAsImage(image)
    corrected = image / sitk.Exp(log_bias_field)
    
    return corrected

# Apply N4 correction
corrected_t1 = n4_bias_correction(patient_t1, shrink_factor=4)
sitk.WriteImage(corrected_t1, "patient_T1w_N4corrected.nii.gz")

# ============================================================
# 6. CONVERTING BETWEEN NUMPY AND SITK
# ============================================================

def sitk_to_numpy(image: sitk.Image) -> np.ndarray:
    """Convert SimpleITK image to numpy array (C-contiguous)."""
    return sitk.GetArrayFromImage(image)

def numpy_to_sitk(
    array: np.ndarray,
    reference: sitk.Image = None,
    spacing: tuple = (1.0, 1.0, 1.0),
    origin: tuple = (0.0, 0.0, 0.0)
) -> sitk.Image:
    """Convert numpy array to SimpleITK image."""
    image = sitk.GetImageFromArray(array)
    if reference is not None:
        image.SetSpacing(reference.GetSpacing())
        image.SetOrigin(reference.GetOrigin())
        image.SetDirection(reference.GetDirection())
    else:
        image.SetSpacing(spacing)
        image.SetOrigin(origin)
    return image

# ============================================================
# 7. INTENSITY NORMALIZATION
# ============================================================

def zscore_normalize(
    image: sitk.Image,
    mask: sitk.Image = None
) -> sitk.Image:
    """
    Z-score normalization within a mask.
    Commonly used for deep learning preprocessing.
    """
    arr = sitk.GetArrayFromImage(image).astype(np.float32)
    
    if mask is not None:
        mask_arr = sitk.GetArrayFromImage(mask) > 0
        vals = arr[mask_arr]
    else:
        vals = arr[arr > 0]
    
    mean = np.mean(vals)
    std = np.std(vals)
    
    normalized = (arr - mean) / (std + 1e-8)
    if mask is not None:
        normalized[~mask_arr] = 0.0
    
    result = sitk.GetImageFromArray(normalized)
    result.SetSpacing(image.GetSpacing())
    result.SetOrigin(image.GetOrigin())
    result.SetDirection(image.GetDirection())
    return result

# ============================================================
# 8. 2D SLICE EXTRACTION (for 2D networks)
# ============================================================

def extract_axial_slices(volume: sitk.Image, step: int = 1) -> list:
    """Extract axial slices from a 3D volume."""
    size = volume.GetSize()
    slices = []
    for z in range(0, size[2], step):
        slice_img = volume[:, :, z]
        slices.append(slice_img)
    return slices

def extract_coronal_slices(volume: sitk.Image, step: int = 1) -> list:
    """Extract coronal slices from a 3D volume."""
    size = volume.GetSize()
    slices = []
    for y in range(0, size[1], step):
        slice_img = volume[:, y, :]
        slices.append(slice_img)
    return slices

def extract_sagittal_slices(volume: sitk.Image, step: int = 1) -> list:
    """Extract sagittal slices from a 3D volume."""
    size = volume.GetSize()
    slices = []
    for x in range(0, size[0], step):
        slice_img = volume[x, :, :]
        slices.append(slice_img)
    return slices
```

---

### 2.3 dicognito

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/pydicom/dicognito |
| **License** | MIT |
| **PyPI** | https://pypi.org/project/dicognito/ |
| **Installation** | `pip install dicognito` |
| **Integration Complexity** | 2/5 (Low - CLI + Python API) |
| **Clinical Relevance** | 5/5 (HIPAA-compliant de-identification) |
| **Stars** | 80+ |

#### Overview

dicognito is a DICOM de-identification tool that implements the **DICOM Basic Application Level Confidentiality Profile**. It anonymizes DICOM files by removing or modifying tags that contain PHI (Protected Health Information). It is designed to be **HIPAA Safe Harbor compliant** and handles both metadata and burned-in pixel annotations.

#### Installation

```bash
pip install dicognito

# Or with pydicom
pip install dicognito pydicom
```

#### Clinical Code Examples

```python
"""
dicognito: HIPAA-Compliant DICOM De-identification
--------------------------------------------------
Purpose: Remove PHI from DICOM files for research use.
         Implements DICOM Basic Confidentiality Profile.
"""

import dicognito.anonymizer
from dicognito.anonymizer import Anonymizer
from dicognito.identifier import Identifier
import pydicom
from pydicom import dcmread
from pathlib import Path
import shutil

# ============================================================
# 1. BASIC DE-IDENTIFICATION WITH ANONYMIZER
# ============================================================

def anonymize_dicom_file(
    input_path: str,
    output_path: str,
    keep_structure: bool = True
) -> str:
    """
    De-identify a single DICOM file.
    Removes/modifies PHI tags per DICOM Basic Confidentiality Profile.
    """
    ds = dcmread(input_path)
    
    # Create anonymizer
    anonymizer = Anonymizer()
    
    # Apply anonymization - modifies dataset in place
    anonymizer.anonymize(ds)
    
    # Save de-identified file
    ds.save_as(output_path)
    return output_path

# ============================================================
# 2. BATCH DE-IDENTIFICATION WITH UID REMAPPING
# ============================================================

def anonymize_study_directory(
    input_dir: str,
    output_dir: str,
    remove_private_tags: bool = True
) -> dict:
    """
    De-identify all DICOM files in a directory tree.
    Remaps UIDs consistently within studies while preserving
    series/study relationships.
    
    Returns mapping of original to anonymized UIDs for audit trail.
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    anonymizer = Anonymizer()
    uid_map = {}  # Audit trail
    
    for dcm_file in input_path.rglob('*.dcm'):
        try:
            ds = dcmread(str(dcm_file))
            original_uid = ds.StudyInstanceUID
            
            # Store original metadata for audit
            uid_map[dcm_file.name] = {
                'original_study_uid': original_uid,
                'original_patient_id': ds.get('PatientID', ''),
                'original_patient_name': str(ds.get('PatientName', '')),
            }
            
            # Anonymize
            anonymizer.anonymize(ds)
            
            # Store new UIDs
            uid_map[dcm_file.name]['anonymized_study_uid'] = ds.StudyInstanceUID
            uid_map[dcm_file.name]['anonymized_patient_id'] = ds.get('PatientID', '')
            
            # Write output maintaining relative path
            rel_path = dcm_file.relative_to(input_path)
            out_file = output_path / rel_path
            out_file.parent.mkdir(parents=True, exist_ok=True)
            ds.save_as(str(out_file))
            
        except Exception as e:
            uid_map[dcm_file.name] = {'error': str(e)}
    
    # Save audit trail
    with open(output_path / 'deidentification_audit.json', 'w') as f:
        json.dump(uid_map, f, indent=2)
    
    return uid_map

# ============================================================
# 3. CUSTOM DE-IDENTIFICATION WITH SPECIFIC TAGS
# ============================================================

def custom_anonymize(
    ds: pydicom.Dataset,
    remove_tags: list = None,
    hash_patient_id: bool = True
) -> pydicom.Dataset:
    """
    Custom anonymization with specific tag removal and optional
    patient ID hashing for longitudinal tracking.
    """
    import hashlib
    
    # Default tags to remove (HIPAA identifiers)
    if remove_tags is None:
        remove_tags = [
            'PatientName',
            'PatientBirthDate',
            'PatientBirthTime',
            'PatientSex',
            'PatientWeight',
            'PatientAge',
            'PatientMotherBirthName',
            'OtherPatientIDs',
            'OtherPatientNames',
            'PatientAddress',
            'PatientTelephoneNumbers',
            'PatientInsurancePlanCodeSequence',
            'PerformingPhysicianName',
            'ReferringPhysicianName',
            'ConsultingPhysicianName',
            'PhysiciansOfRecord',
            'OperatorsName',
            'AdmittingDiagnosesDescription',
            'ContentSequence',
            'WaveformAnnotationSequence',
            'AcquisitionContextSequence',
        ]
    
    # Hash PatientID if requested (preserves linkability for longitudinal studies)
    if hash_patient_id and 'PatientID' in ds:
        original_id = str(ds.PatientID)
        hashed_id = hashlib.sha256(original_id.encode()).hexdigest()[:16]
        ds.PatientID = f"ANON_{hashed_id}"
    
    # Remove specified tags
    for tag in remove_tags:
        if hasattr(ds, tag):
            delattr(ds, tag)
    
    # Remove private tags
    ds.remove_private_tags()
    
    # Clean sequences
    if 'RequestAttributesSequence' in ds:
        del ds.RequestAttributesSequence
    
    # Remove burned-in annotations (pixel data cleaning)
    # Note: For pixel-level PHI removal, specialized tools are needed
    # See: deid package for pixel-level de-identification
    
    return ds

# ============================================================
# 4. DE-IDENTIFICATION QC / VALIDATION
# ============================================================

def validate_deidentification(
    ds: pydicom.Dataset,
    required_preserved_tags: list = None
) -> dict:
    """
    Validate that de-identification was successful.
    Check that no PHI remains in common locations.
    """
    if required_preserved_tags is None:
        required_preserved_tags = [
            'StudyInstanceUID',
            'SeriesInstanceUID',
            'SOPInstanceUID',
            'StudyDate',
            'Modality',
            'Rows',
            'Columns',
        ]
    
    results = {
        'phi_tags_found': [],
        'missing_required_tags': [],
        'passed': False
    }
    
    # Check for common PHI tags
    phi_indicators = [
        'PatientName', 'PatientID', 'PatientBirthDate',
        'PatientAddress', 'ReferringPhysicianName',
        'PerformingPhysicianName', 'OperatorsName',
    ]
    
    for tag in phi_indicators:
        if hasattr(ds, tag):
            val = getattr(ds, tag)
            if val and str(val).strip():
                results['phi_tags_found'].append(f"{tag}: {val}")
    
    # Check required preserved tags
    for tag in required_preserved_tags:
        if not hasattr(ds, tag):
            results['missing_required_tags'].append(tag)
    
    results['passed'] = (
        len(results['phi_tags_found']) == 0 and
        len(results['missing_required_tags']) == 0
    )
    
    return results

# ============================================================
# 5. CLI EQUIVALENT
# ============================================================
# dicognito can also be used from command line:
#   dicognito anonymize --in-place *.dcm
#   dicognito anonymize --output-dir ./anonymized/ ./input/
```

---

### 2.4 dicomweb-client

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/herrmannlab/dicomweb-client |
| **License** | MIT |
| **PyPI** | https://pypi.org/project/dicomweb-client/ |
| **Installation** | `pip install dicomweb-client` |
| **Integration Complexity** | 3/5 (Medium - requires DICOMweb endpoint) |
| **Clinical Relevance** | 4/5 (Essential for cloud/PACS integration) |
| **Stars** | 200+ |

#### Overview

The dicomweb-client provides a Python client for **DICOMweb services** (WADO-RS, QIDO-RS, STOW-RS). It enables querying, retrieving, and storing DICOM objects via RESTful HTTP interfaces. Essential for cloud-based imaging workflows and modern PACS integration.

#### Installation

```bash
pip install dicomweb-client

# With async support
pip install dicomweb-client[async]

# For certificate authentication
pip install dicomweb-client[certs]
```

#### Clinical Code Examples

```python
"""
dicomweb-client: DICOMweb Access for Clinical MRI
-------------------------------------------------
Purpose: Query, retrieve, and store DICOM objects via DICOMweb.
         Supports WADO-RS (retrieve), QIDO-RS (query), STOW-RS (store).
"""

from dicomweb_client.api import DICOMwebClient
from dicomweb_client.protocol import DICOMfileClient
from dicomweb_client.session_utils import create_session_from_user_credentials
import pydicom
from pydicom import dcmread
from pathlib import Path
import json

# ============================================================
# 1. CLIENT INITIALIZATION
# ============================================================

def create_client(url: str, username: str = None, password: str = None) -> DICOMwebClient:
    """
    Create DICOMweb client with optional authentication.
    
    Parameters:
    -----------
    url : str
        Base URL of DICOMweb service (e.g., "https://pacs.example.com/wado-rs")
    username : str, optional
        HTTP Basic Auth username
    password : str, optional
        HTTP Basic Auth password
    """
    if username and password:
        session = create_session_from_user_credentials(username, password)
        client = DICOMwebClient(url, session=session)
    else:
        client = DICOMwebClient(url)
    return client

# Example: Orthanc DICOMweb (default)
# client = create_client("http://localhost:8042/dicom-web")

# Example: Google Healthcare API
# client = create_client(
#     "https://healthcare.googleapis.com/v1/projects/PROJECT/locations/LOCATION/datasets/DATASET/dicomStores/DICOMSTORE/dicomWeb",
#     credentials=google_credentials
# )

# ============================================================
# 2. QIDO-RS: QUERY FOR STUDIES/SERIES/INSTANCES
# ============================================================

def search_studies(
    client: DICOMwebClient,
    patient_id: str = None,
    study_date: str = None,  # Format: YYYYMMDD or YYYYMMDD-YYYYMMDD
    modality: str = 'MR',
    limit: int = 100
) -> list:
    """
    Search for studies matching criteria using QIDO-RS.
    
    Returns list of Study-level attributes as pydicom Datasets.
    """
    query_params = {'ModalitiesInStudy': modality}
    if patient_id:
        query_params['PatientID'] = patient_id
    if study_date:
        query_params['StudyDate'] = study_date
    
    studies = client.search_for_studies(
        search_filters=query_params,
        limit=limit,
        fuzzymatching=True
    )
    return studies

def search_series(
    client: DICOMwebClient,
    study_instance_uid: str,
    modality: str = 'MR'
) -> list:
    """Search for series within a study."""
    series = client.search_for_series(
        study_instance_uid=study_instance_uid,
        search_filters={'Modality': modality}
    )
    return series

def search_instances(
    client: DICOMwebClient,
    study_instance_uid: str,
    series_instance_uid: str
) -> list:
    """Search for instances (DICOM files) within a series."""
    instances = client.search_for_instances(
        study_instance_uid=study_instance_uid,
        series_instance_uid=series_instance_uid
    )
    return instances

# Usage
# studies = search_studies(client, patient_id='12345', study_date='20250101-20251231')
# for study in studies:
#     print(f"Study: {study.StudyDescription}, Date: {study.StudyDate}")

# ============================================================
# 3. WADO-RS: RETRIEVE DICOM OBJECTS
# ============================================================

def retrieve_study(
    client: DICOMwebClient,
    study_instance_uid: str,
    output_dir: str
) -> list[str]:
    """
    Retrieve all instances in a study using WADO-RS.
    Saves as individual DICOM files.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    datasets = client.retrieve_study(
        study_instance_uid=study_instance_uid
    )
    
    saved_files = []
    for i, ds in enumerate(datasets):
        fname = output_path / f"instance_{i:04d}.dcm"
        ds.save_as(str(fname))
        saved_files.append(str(fname))
    
    return saved_files

def retrieve_series(
    client: DICOMwebClient,
    study_instance_uid: str,
    series_instance_uid: str,
    output_dir: str
) -> list[str]:
    """Retrieve all instances in a specific series."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    datasets = client.retrieve_series(
        study_instance_uid=study_instance_uid,
        series_instance_uid=series_instance_uid
    )
    
    saved_files = []
    for i, ds in enumerate(datasets):
        fname = output_path / f"slice_{i:04d}.dcm"
        ds.save_as(str(fname))
        saved_files.append(str(fname))
    
    return saved_files

def retrieve_instance(
    client: DICOMwebClient,
    study_instance_uid: str,
    series_instance_uid: str,
    sop_instance_uid: str
) -> pydicom.Dataset:
    """Retrieve a single DICOM instance."""
    dataset = client.retrieve_instance(
        study_instance_uid=study_instance_uid,
        series_instance_uid=series_instance_uid,
        sop_instance_uid=sop_instance_uid
    )
    return dataset

def retrieve_instance_frames(
    client: DICOMwebClient,
    study_instance_uid: str,
    series_instance_uid: str,
    sop_instance_uid: str,
    frame_numbers: list = None
) -> list:
    """
    Retrieve specific frames from a multi-frame DICOM instance.
    Useful for enhanced MR DICOM with multiple frames per file.
    """
    if frame_numbers:
        frames = client.retrieve_instance_frames(
            study_instance_uid=study_instance_uid,
            series_instance_uid=series_instance_uid,
            sop_instance_uid=sop_instance_uid,
            frame_numbers=frame_numbers
        )
    else:
        frames = client.retrieve_instance_frames(
            study_instance_uid=study_instance_uid,
            series_instance_uid=series_instance_uid,
            sop_instance_uid=sop_instance_uid
        )
    return frames

# ============================================================
# 4. STOW-RS: STORE DICOM OBJECTS
# ============================================================

def store_instances(
    client: DICOMwebClient,
    datasets: list[pydicom.Dataset]
) -> dict:
    """
    Store DICOM instances to DICOMweb server using STOW-RS.
    Returns server response with stored instance references.
    """
    response = client.store_instances(datasets=datasets)
    return response

def store_from_files(
    client: DICOMwebClient,
    file_paths: list[str]
) -> dict:
    """Store DICOM instances from file paths."""
    datasets = [dcmread(f) for f in file_paths]
    return store_instances(client, datasets)

# ============================================================
# 5. RETRIEVE METADATA (WITHOUT PIXEL DATA)
# ============================================================

def retrieve_study_metadata(
    client: DICOMwebClient,
    study_instance_uid: str
) -> list[dict]:
    """
    Retrieve metadata for all instances in a study.
    Much faster than full retrieve - no pixel data.
    """
    metadata = client.retrieve_study_metadata(
        study_instance_uid=study_instance_uid
    )
    return metadata

# ============================================================
# 6. COMPLETE WORKFLOW: QUERY, RETRIEVE, PROCESS
# ============================================================

def download_mri_study(
    client: DICOMwebClient,
    patient_id: str = None,
    date_range: str = None,
    output_dir: str = "./downloaded_studies"
) -> dict:
    """
    Complete workflow: search for MRI studies and download all series.
    """
    results = {'studies': []}
    
    # Step 1: Search for studies
    studies = search_studies(
        client, patient_id=patient_id,
        study_date=date_range, modality='MR'
    )
    
    for study in studies:
        study_uid = study.StudyInstanceUID
        study_info = {
            'study_uid': study_uid,
            'study_date': study.get('StudyDate', ''),
            'study_description': study.get('StudyDescription', ''),
            'patient_id': study.get('PatientID', ''),
            'series': []
        }
        
        # Step 2: Get series in study
        series_list = search_series(client, study_uid, modality='MR')
        
        for series in series_list:
            series_uid = series.SeriesInstanceUID
            series_desc = series.get('SeriesDescription', 'unknown')
            
            # Create output directory
            safe_desc = "".join(c if c.isalnum() else '_' for c in str(series_desc))
            series_dir = f"{output_dir}/{study_uid}/{safe_desc}"
            
            # Step 3: Download series
            files = retrieve_series(
                client, study_uid, series_uid, series_dir
            )
            
            study_info['series'].append({
                'series_uid': series_uid,
                'series_description': series_desc,
                'num_instances': len(files),
                'files': files
            })
        
        results['studies'].append(study_info)
    
    return results
```

---

### 2.5 orthanc-python

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/sgdan/orthanc-python (bindings) |
| **Project** | https://orthanc.uclouvain.be/ |
| **License** | GPL-3.0 (Orthanc), MIT (Python bindings) |
| **Installation** | `pip install orthanc` (client) |
| **Integration Complexity** | 4/5 (High - requires Orthanc server setup) |
| **Clinical Relevance** | 4/5 (Excellent DICOM server + plugin ecosystem) |
| **Stars** | N/A (mature project, part of Orthanc ecosystem) |

#### Overview

Orthanc is an open-source, lightweight DICOM server with a powerful REST API and Python plugin system. The `orthanc-python` plugin allows writing server-side Python scripts that execute within Orthanc. It is ideal for building **DICOM routing, preprocessing, and automation pipelines** that run server-side.

#### Installation

```bash
# Install Python client library
pip install orthanc

# For plugin development (inside Orthanc)
# Orthanc must be built with Python plugin support
# See: https://orthanc.uclouvain.be/book/plugins/python.html
```

#### Clinical Code Examples

```python
"""
Orthanc Python: DICOM Server Automation
---------------------------------------
Purpose: Server-side DICOM routing, on-the-fly processing,
         and REST API integration for clinical MRI workflows.
         
Note: These examples work both as REST API clients AND as
      Orthanc Python plugins running server-side.
"""

import orthanc
import json
import requests
from pathlib import Path
from typing import List, Dict

# ============================================================
# 1. REST API CLIENT PATTERN
# ============================================================

class OrthancClient:
    """Python client for Orthanc REST API."""
    
    def __init__(self, url: str = "http://localhost:8042",
                 username: str = None, password: str = None):
        self.url = url.rstrip('/')
        self.auth = (username, password) if username and password else None
    
    def _get(self, endpoint: str) -> dict:
        """GET request to Orthanc API."""
        response = requests.get(f"{self.url}{endpoint}", auth=self.auth)
        response.raise_for_status()
        return response.json()
    
    def _post(self, endpoint: str, data: dict = None) -> dict:
        """POST request to Orthanc API."""
        response = requests.post(
            f"{self.url}{endpoint}",
            json=data, auth=self.auth
        )
        response.raise_for_status()
        return response.json()
    
    # --- Patient Management ---
    def get_patients(self) -> List[str]:
        """Get list of all patient IDs."""
        return self._get("/patients")
    
    def get_patient(self, patient_id: str) -> dict:
        """Get patient details."""
        return self._get(f"/patients/{patient_id}")
    
    # --- Study Management ---
    def get_studies(self) -> List[str]:
        """Get list of all study IDs."""
        return self._get("/studies")
    
    def get_study(self, study_id: str) -> dict:
        """Get study details including series."""
        return self._get(f"/studies/{study_id}")
    
    # --- Series Management ---
    def get_series(self, series_id: str) -> dict:
        """Get series details including instances."""
        return self._get(f"/series/{series_id}")
    
    def get_series_instances(self, series_id: str) -> List[dict]:
        """Get all instances in a series."""
        return self._get(f"/series/{series_id}/instances")
    
    # --- DICOM Tag Access ---
    def get_instance_tags(self, instance_id: str, simplify: bool = True) -> dict:
        """Get DICOM tags for an instance."""
        endpoint = f"/instances/{instance_id}/content?simplify={'true' if simplify else 'false'}"
        return self._get(endpoint)
    
    def get_simplified_tags(self, instance_id: str) -> dict:
        """Get simplified DICOM tags."""
        return self._get(f"/instances/{instance_id}/simplified-tags")
    
    # --- File Operations ---
    def download_instance(self, instance_id: str, output_path: str):
        """Download DICOM file."""
        response = requests.get(
            f"{self.url}/instances/{instance_id}/file",
            auth=self.auth
        )
        response.raise_for_status()
        with open(output_path, 'wb') as f:
            f.write(response.content)
    
    def download_series_dicom(self, series_id: str, output_path: str):
        """Download series as zip of DICOM files."""
        response = requests.get(
            f"{self.url}/series/{series_id}/archive",
            auth=self.auth
        )
        response.raise_for_status()
        with open(output_path, 'wb') as f:
            f.write(response.content)
    
    # --- Query/Retrieve (C-FIND/C-MOVE equivalent) ---
    def query_remote(self, remote: str, query: dict) -> List[dict]:
        """
        Query a remote DICOM modality.
        
        Parameters:
        -----------
        remote : str
            Remote modality name (configured in Orthanc)
        query : dict
            DICOM query keys, e.g., {'Level': 'Study', 'Query': {'PatientID': '*', 'Modality': 'MR'}}
        """
        return self._post(f"/modalities/{remote}/query", query)
    
    def retrieve_remote(self, remote: str, query_id: str):
        """Retrieve from remote query result."""
        return self._post(f"/modalities/{remote}/query/{query_id}/retrieve", {})

# ============================================================
# 2. MRI-SPECIFIC SERIES FILTERING
# ============================================================

def find_mri_series(
    client: OrthancClient,
    series_description_filter: str = None,
    date_from: str = None,
    date_to: str = None
) -> List[Dict]:
    """
    Find all MRI series matching criteria across all studies.
    
    Returns list of series with metadata for each.
    """
    mri_series = []
    studies = client.get_studies()
    
    for study_id in studies:
        study = client.get_study(study_id)
        study_date = study.get('MainDicomTags', {}).get('StudyDate', '')
        
        # Date filtering
        if date_from and study_date < date_from:
            continue
        if date_to and study_date > date_to:
            continue
        
        for series_id in study.get('Series', []):
            series = client.get_series(series_id)
            tags = series.get('MainDicomTags', {})
            
            # Check modality
            modality = tags.get('Modality', '')
            if modality != 'MR':
                continue
            
            # Series description filter
            series_desc = tags.get('SeriesDescription', '').lower()
            if series_description_filter:
                if series_description_filter.lower() not in series_desc:
                    continue
            
            instances = series.get('Instances', [])
            mri_series.append({
                'series_id': series_id,
                'study_id': study_id,
                'study_date': study_date,
                'series_description': tags.get('SeriesDescription', ''),
                'series_number': tags.get('SeriesNumber', ''),
                'protocol_name': tags.get('ProtocolName', ''),
                'num_instances': len(instances),
                'modality': modality,
            })
    
    return mri_series

# ============================================================
# 3. ORTHANC PYTHON PLUGIN (Server-Side)
# ============================================================
# This code runs INSIDE Orthanc as a plugin, not as a client

"""
# orthanc_plugin.py - Save as plugin in Orthanc's Python plugin folder
# This runs server-side when DICOM instances are received

import orthanc

def on_received_instance(instance_id):
    # Called when a new DICOM instance is received
    print(f"Received instance: {instance_id}")
    
    # Get DICOM tags
    tags = json.loads(orthanc.RestApiGet(f"/instances/{instance_id}/simplified-tags"))
    
    # Log MRI-specific info
    if tags.get('Modality') == 'MR':
        print(f"  Series: {tags.get('SeriesDescription')}")
        print(f"  TR/TE: {tags.get('RepetitionTime')}/{tags.get('EchoTime')}")
        
        # Auto-route based on series description
        series_desc = tags.get('SeriesDescription', '').lower()
        if 't1' in series_desc or 'bravo' in series_desc:
            # Route to T1 processing pipeline
            orthanc.RestApiPost(f"/peers/T1_PIPELINE/store", instance_id)
        elif 't2' in series_desc or 'cube' in series_desc:
            # Route to T2 processing pipeline  
            orthanc.RestApiPost(f"/peers/T2_PIPELINE/store", instance_id)
        elif 'flair' in series_desc:
            # Route to FLAIR processing pipeline
            orthanc.RestApiPost(f"/peers/FLAIR_PIPELINE/store", instance_id)

# Register callback
orthanc.RegisterOnReceivedInstanceCallback(on_received_instance)
"""

# ============================================================
# 4. ANONYMIZATION VIA ORTHANC
# ============================================================

def anonymize_in_orthanc(
    client: OrthancClient,
    patient_id: str,
    replacement_name: str = "ANONYMOUS"
) -> str:
    """
    Anonymize a patient using Orthanc's built-in anonymization.
    Returns the ID of the new anonymized patient.
    """
    anon_config = {
        "Replace": {
            "PatientName": replacement_name,
        },
        "Keep": [
            "StudyDescription",
            "SeriesDescription",
            "StudyDate",
            "StudyTime",
        ],
        "Force": True
    }
    
    result = client._post(f"/patients/{patient_id}/anonymize", anon_config)
    return result.get('ID', '')

# ============================================================
# 5. EXPORT TO NIfTI VIA ORTHANC
# ============================================================

def export_series_to_nifti(
    client: OrthancClient,
    series_id: str,
    output_path: str
):
    """
    Export a DICOM series from Orthanc as NIfTI.
    Orthanc handles the conversion internally.
    """
    response = requests.get(
        f"{client.url}/series/{series_id}/nifti",
        auth=client.auth
    )
    response.raise_for_status()
    with open(output_path, 'wb') as f:
        f.write(response.content)
```

---

### 2.6 highdicom

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/herrmannlab/highdicom |
| **License** | MIT |
| **PyPI** | https://pypi.org/project/highdicom/ |
| **Installation** | `pip install highdicom` |
| **Integration Complexity** | 4/5 (High - requires deep DICOM SR knowledge) |
| **Clinical Relevance** | 4/5 (Essential for structured reporting & AI results) |
| **Stars** | 150+ |

#### Overview

highdicom is a Python library for creating **DICOM-compliant objects** for image-derived information, including: Structured Reports (SR), Segmentation images, Parametric Maps, and Legacy Converted Enhanced CT/MR images. It is essential for encoding AI/ML results and quantitative analysis in standards-compliant DICOM format.

#### Installation

```bash
pip install highdicom

# With full dependencies
pip install highdicom[full]
```

#### Clinical Code Examples

```python
"""
highdicom: DICOM SR Creation for Clinical MRI
---------------------------------------------
Purpose: Create DICOM Structured Reports (SR) for MRI analysis results,
         including quantitative measurements and AI algorithm outputs.
"""

import highdicom as hd
from highdicom.sr import (
    Comprehensive3DSR,
    MeasurementReport,
    Measurement,
    TrackingIdentifier,
    QualitativeEvaluation,
    ImageLibrary,
    ImageLibraryEntryDescriptors,
)
from highdicom.sr.coding import CodedConcept
from highdicom.sr.value_types import (
    CodeContentItem,
    NumContentItem,
    ContainerContentItem,
    TextContentItem,
)
from highdicom.sr.templates import (
    PlanarROIMeasurementsAndQualitativeEvaluations,
    Measurement,
    AlgorithmIdentification,
    ObserverContext,
    PersonObserverIdentifyingAttributes,
    DeviceObserverIdentifyingAttributes,
)
import pydicom
from pydicom.uid import generate_uid
from pydicom.dataset import Dataset
from datetime import datetime
import numpy as np

# ============================================================
# 1. CREATE A BASIC STRUCTURED REPORT (SR)
# ============================================================

def create_mri_measurement_sr(
    source_dicom_path: str,
    output_path: str,
    measurements: list[dict],
    observer_name: str = "AI Algorithm",
    algorithm_name: str = "BrainVolumeEstimator",
    algorithm_version: str = "1.0.0"
) -> str:
    """
    Create a DICOM Structured Report containing MRI measurements.
    
    Parameters:
    -----------
    source_dicom_path : str
        Path to a reference DICOM image from the same study
    measurements : list[dict]
        Each dict has: {
            'name': str (LOINC code meaning),
            'value': float,
            'unit': str (UCUM unit),
            'loinc_code': str,
            'finding_site': str (optional)
        }
    observer_name : str
        Name of the observer/algoithm
    algorithm_name : str
        Name of the algorithm
    algorithm_version : str
        Version of the algorithm
    
    Returns:
    --------
    str : Path to saved SR file
    """
    # Read source DICOM to inherit study context
    source = pydicom.dcmread(source_dicom_path)
    
    # Coding schemes
    loinc_scheme = hd.sr.CodingSchemeDesignator('LN')
    ucum_scheme = hd.sr.CodingSchemeDesignator('UCUM')
    sct_scheme = hd.sr.CodingSchemeDesignator('SCT')
    
    # Create measurement items
    measurement_items = []
    for m in measurements:
        # Create the measurement concept
        concept = CodedConcept(
            value=m['loinc_code'],
            scheme_designator=loinc_scheme,
            meaning=m['name']
        )
        
        # Create unit concept
        unit_concept = CodedConcept(
            value=m['unit'],
            scheme_designator=ucum_scheme,
            meaning=m['unit']
        )
        
        # Create measurement
        measurement = Measurement(
            name=concept,
            value=m['value'],
            unit=unit_concept
        )
        measurement_items.append(measurement)
    
    # Create algorithm identification
    algorithm = AlgorithmIdentification(
        name=algorithm_name,
        version=algorithm_version,
        family=CodedConcept(
            value='125007',
            scheme_designator='DCM',
            meaning='Artifact Detection Algorithm'
        )
    )
    
    # Create observer context
    observer = PersonObserverIdentifyingAttributes(
        name=observer_name
    )
    
    # Create the SR
    procedure_reported = CodedConcept(
        value='363680008',
        scheme_designator='SCT',
        meaning='MR imaging'
    )
    
    sr_dataset = Comprehensive3DSR(
        evidence=[source],
        content=measurement_items,
        series_instance_uid=generate_uid(),
        series_number=1000,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer='DeepSynaps',
        manufacturer_model_name='MRI Processing Stack',
        software_versions='1.0.0',
        device_serial_number='',
        institution_name=source.get('InstitutionName', ''),
        institution_address='',
        content_creator_name=observer_name,
        procedure_reported=[procedure_reported],
        verifying_observer_identification_code_sequences=[]
    )
    
    sr_dataset.save_as(output_path)
    return output_path

# ============================================================
# 2. CREATE BRAIN VOLUME MEASUREMENT REPORT
# ============================================================

def create_brain_volume_sr(
    source_dicom_path: str,
    output_path: str,
    total_brain_volume_ml: float,
    grey_matter_volume_ml: float = None,
    white_matter_volume_ml: float = None,
    csf_volume_ml: float = None,
    ventricular_volume_ml: float = None,
    algorithm_name: str = "BrainVolumeEstimator",
    algorithm_version: str = "1.0.0"
) -> str:
    """
    Create a DICOM SR with brain volume measurements.
    Uses LOINC codes for standardized measurement encoding.
    """
    measurements = []
    
    # Total brain volume (custom code - no standard LOINC for this)
    measurements.append({
        'name': 'Brain Volume',
        'value': total_brain_volume_ml,
        'unit': 'mL',
        'loinc_code': '11889-1',  # Volume of tissue
    })
    
    if grey_matter_volume_ml:
        measurements.append({
            'name': 'Grey Matter Volume',
            'value': grey_matter_volume_ml,
            'unit': 'mL',
            'loinc_code': '11889-1',
        })
    
    if white_matter_volume_ml:
        measurements.append({
            'name': 'White Matter Volume',
            'value': white_matter_volume_ml,
            'unit': 'mL',
            'loinc_code': '11889-1',
        })
    
    if csf_volume_ml:
        measurements.append({
            'name': 'CSF Volume',
            'value': csf_volume_ml,
            'unit': 'mL',
            'loinc_code': '11889-1',
        })
    
    return create_mri_measurement_sr(
        source_dicom_path=source_dicom_path,
        output_path=output_path,
        measurements=measurements,
        algorithm_name=algorithm_name,
        algorithm_version=algorithm_version
    )

# ============================================================
# 3. CREATE DICOM SEGMENTATION IMAGE
# ============================================================

def create_segmentation_dicom(
    source_dicom_series: list[pydicom.Dataset],
    segmentation_array: np.ndarray,
    output_path: str,
    segment_descriptions: list[dict]
) -> str:
    """
    Create a DICOM Segmentation object from a label map.
    
    Parameters:
    -----------
    source_dicom_series : list[pydicom.Dataset]
        Source DICOM instances (one per slice)
    segmentation_array : np.ndarray
        3D integer array where each value is a segment label
    segment_descriptions : list[dict]
        Each dict: {
            'label': int,
            'name': str (e.g., 'Grey Matter'),
            'algorithm_type': str ('AUTOMATIC' or 'MANUAL'),
            'algorithm_name': str
        }
    """
    from highdicom.seg import Segmentation
    from highdicom.seg.content import SegmentDescription
    from highdicom.sr.coding import CodedConcept
    
    segments = []
    for desc in segment_descriptions:
        segment = SegmentDescription(
            segment_number=desc['label'],
            segment_label=desc['name'],
            segmented_property_category=CodedConcept(
                value='123037004',
                scheme_designator='SCT',
                meaning='Anatomical Structure'
            ),
            segmented_property_type=CodedConcept(
                value='12738006',
                scheme_designator='SCT',
                meaning='Brain tissue structure'
            ),
            algorithm_type=desc.get('algorithm_type', 'AUTOMATIC'),
            algorithm_identification=AlgorithmIdentification(
                name=desc.get('algorithm_name', 'SegmentationAlgorithm'),
                version='1.0.0'
            ) if desc.get('algorithm_type') == 'AUTOMATIC' else None
        )
        segments.append(segment)
    
    seg = Segmentation(
        source_images=source_dicom_series,
        pixel_array=segmentation_array.astype(np.uint8),
        segmentation_type='BINARY',
        segment_descriptions=segments,
        series_instance_uid=generate_uid(),
        series_number=500,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer='DeepSynaps',
        manufacturer_model_name='MRI Processing Stack',
        software_versions='1.0.0',
        device_serial_number=''
    )
    
    seg.save_as(output_path)
    return output_path

# ============================================================
# 4. ENHANCED MR IMAGE CREATION
# ============================================================

def create_enhanced_mr(
    source_slices: list[pydicom.Dataset],
    output_path: str
) -> str:
    """
    Convert legacy DICOM MR slices to a single Enhanced MR Image.
    Reduces file count and enables multi-frame features.
    """
    from highdicom.legacy import convert_legacy_dicom
    
    enhanced = convert_legacy_dicom(
        datasets=source_slices,
        series_instance_uid=generate_uid(),
        series_number=1,
        sop_instance_uid=generate_uid(),
        instance_number=1
    )
    
    enhanced.save_as(output_path)
    return output_path
```

---

## 3. NIfTI Processing Toolkit

### 3.1 NiBabel

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/nipy/nibabel |
| **License** | MIT |
| **PyPI** | https://pypi.org/project/nibabel/ |
| **Installation** | `pip install nibabel` |
| **Integration Complexity** | 1/5 (Minimal - pure Python, NumPy integration) |
| **Clinical Relevance** | 5/5 (Essential for all NIfTI/ANALYZE/CIFTI I/O) |
| **Stars** | 1,200+ |

#### Overview

NiBabel is the foundational Python library for reading and writing neuroimaging data formats including **NIfTI-1, NIfTI-2, ANALYZE, and CIFTI-2**. It provides full access to image data as NumPy arrays and metadata through headers. Essential for virtually all Python-based neuroimaging pipelines.

#### Installation

```bash
# Base installation
pip install nibabel

# With all format support
pip install nibabel[pydicom,hdf5,zstd]

# Clinical stack
pip install nibabel numpy scipy matplotlib nilearn
```

#### Clinical Code Examples

```python
"""
NiBabel: NIfTI I/O for Clinical Neuroimaging
----------------------------------------------
Purpose: Read/write NIfTI files, extract metadata, manage affine transforms,
         and prepare data for analysis pipelines.
"""

import nibabel as nib
from nibabel import Nifti1Image, Nifti2Image, save, load
from nibabel.processing import resample_to_output, smooth_image, conform
import numpy as np
from pathlib import Path

# ============================================================
# 1. READING NIfTI FILES
# ============================================================

img = nib.load('brain_t1.nii.gz')

# Get image data as numpy array
data = img.get_fdata()  # Returns float64 array
# Alternative for memory-efficient access (keeps file open)
data_uncached = img.get_unscaled()

print(f"Shape: {data.shape}")           # e.g., (256, 256, 176) for 3D
print(f"Data type: {data.dtype}")       # e.g., float64
print(f"Voxel size: {img.header.get_zooms()}")  # e.g., (1.0, 1.0, 1.0)

# ============================================================
# 2. ACCESSING METADATA
# ============================================================

# Affine transformation matrix (4x4)
# Maps voxel indices (i,j,k) to world coordinates (x,y,z) in mm
affine = img.affine
print("Affine matrix:")
print(affine)
# [[R11 R12 R13 Tx]
#  [R21 R22 R23 Ty]
#  [R31 R32 R33 Tz]
#  [  0   0   0  1]]

# Header information
header = img.header
print(f"\nHeader info:")
print(f"  sform_code: {header['sform_code']}")  # 1=scanner, 2=aligned, 3=talairach, 4=mni
print(f"  qform_code: {header['qform_code']}")
print(f"  pixdim: {header['pixdim']}")  # voxel dimensions
print(f"  srow_x: {header['srow_x']}")
print(f"  srow_y: {header['srow_y']}")
print(f"  srow_z: {header['srow_z']}")
print(f"  dim_info: {header['dim_info']}")  # freq/phase/slice encoding

# ============================================================
# 3. CREATING & SAVING NIfTI FILES
# ============================================================

def create_nifti_from_array(
    array: np.ndarray,
    affine: np.ndarray = None,
    output_path: str = 'output.nii.gz',
    dtype: np.dtype = np.float32
) -> str:
    """
    Create a NIfTI image from a numpy array with proper affine.
    
    Parameters:
    -----------
    array : np.ndarray
        Image data array
    affine : np.ndarray, optional
        4x4 affine transformation matrix. If None, uses identity.
    output_path : str
        Output file path
    dtype : np.dtype
        Output data type
    """
    if affine is None:
        # Default: 1mm isotropic spacing, origin at center
        affine = np.eye(4)
        for i in range(3):
            affine[i, i] = 1.0  # 1mm spacing
            affine[i, 3] = -array.shape[i] / 2.0  # Center origin
    
    img = Nifti1Image(array.astype(dtype), affine)
    
    # Set sform/qform codes for proper spatial interpretation
    img.set_sform(affine, code=1)  # 1 = scanner coordinates
    img.set_qform(affine, code=1)
    
    nib.save(img, output_path)
    return output_path

# ============================================================
# 4. CONVERTING DICOM TO NIfTI
# ============================================================

def dicom_series_to_nifti(
    dicom_directory: str,
    output_path: str,
    reorient_to_ras: bool = True
) -> nib.Nifti1Image:
    """
    Convert a DICOM series directory to a NIfTI file.
    Uses NiBabel's built-in DICOM support via dcmstack.
    
    Parameters:
    -----------
    dicom_directory : str
        Path to directory containing DICOM files for one series
    output_path : str
        Output NIfTI file path
    reorient_to_ras : bool
        Reorient to RAS+ (Right-Anterior-Superior) orientation
    
    Returns:
    --------
    nib.Nifti1Image : The converted image
    """
    try:
        # Use nibabel's dicomreaders if available
        from nibabel.nicom import dicomreaders
        
        data, affine, slice_times = dicomreaders.read_mosaic_dwi_dir(
            dicom_directory
        )
        img = nib.Nifti1Image(data, affine)
    except:
        # Fallback: read individual slices and stack
        import pydicom
        from pydicom import dcmread
        
        dicom_files = sorted(
            Path(dicom_directory).glob('*.dcm'),
            key=lambda f: int(dcmread(str(f), stop_before_pixels=True).InstanceNumber)
        )
        
        slices = []
        for f in dicom_files:
            ds = dcmread(str(f))
            slices.append(ds.pixel_array)
        
        # Stack and create affine from DICOM geometry
        volume = np.stack(slices, axis=-1).astype(np.float32)
        
        # Build affine from ImageOrientationPatient and ImagePositionPatient
        ds = dcmread(str(dicom_files[0]))
        iop = ds.ImageOrientationPatient  # 6-element list
        ipp = ds.ImagePositionPatient       # 3-element list
        ps = ds.PixelSpacing                # [row_spacing, col_spacing]
        st = ds.SliceThickness
        
        # Build rotation matrix
        row_cos = np.array([float(iop[0]), float(iop[1]), float(iop[2])])
        col_cos = np.array([float(iop[3]), float(iop[4]), float(iop[5])])
        normal = np.cross(row_cos, col_cos)
        
        # Build affine
        affine = np.eye(4)
        affine[:3, 0] = row_cos * float(ps[0])
        affine[:3, 1] = col_cos * float(ps[1])
        affine[:3, 2] = normal * float(st)
        affine[:3, 3] = [float(ipp[0]), float(ipp[1]), float(ipp[2])]
        
        img = nib.Nifti1Image(volume, affine)
    
    if reorient_to_ras:
        img = nib.as_closest_canonical(img)
    
    nib.save(img, output_path)
    return img

# ============================================================
# 5. IMAGE RESAMPLING
# ============================================================

def resample_to_target(
    source_img: nib.Nifti1Image,
    target_img: nib.Nifti1Image,
    interpolation: str = 'linear'
) -> nib.Nifti1Image:
    """
    Resample source image to match target image's voxel grid.
    Uses nibabel's processing module.
    
    Parameters:
    -----------
    source_img : nib.Nifti1Image
        Image to resample
    target_img : nib.Nifti1Image
        Reference image defining target grid
    interpolation : str
        'linear', 'nearest', or 'cubic'
    """
    from nibabel.processing import resample_from_to
    
    resampled = resample_from_to(
        source_img,
        target_img,
        order=1 if interpolation == 'linear' else 0
    )
    return resampled

def resample_to_voxel_size(
    img: nib.Nifti1Image,
    voxel_size: tuple = (1.0, 1.0, 1.0),
    interpolation: str = 'linear'
) -> nib.Nifti1Image:
    """
    Resample image to a specified isotropic voxel size.
    Common preprocessing step before analysis.
    """
    order = 1 if interpolation == 'linear' else 0
    resampled = resample_to_output(img, voxel_sizes=voxel_size, order=order)
    return resampled

# ============================================================
# 6. SPATIAL OPERATIONS
# ============================================================

def get_voxel_coordinates(img: nib.Nifti1Image, voxel: tuple) -> tuple:
    """
    Convert voxel indices (i,j,k) to world coordinates (x,y,z) in mm.
    """
    i, j, k = voxel
    coord = nib.affines.apply_affine(img.affine, [i, j, k])
    return tuple(coord)

def get_voxel_from_coordinates(img: nib.Nifti1Image, coord: tuple) -> tuple:
    """
    Convert world coordinates (x,y,z) in mm to voxel indices (i,j,k).
    """
    inv_affine = np.linalg.inv(img.affine)
    voxel = nib.affines.apply_affine(inv_affine, coord)
    return tuple(np.round(voxel).astype(int))

def extract_roi(img: nib.Nifti1Image, center_voxel: tuple, size: tuple) -> np.ndarray:
    """
    Extract a region of interest around a center voxel.
    
    Parameters:
    -----------
    img : nib.Nifti1Image
        Input image
    center_voxel : tuple
        (i, j, k) center coordinates in voxel space
    size : tuple
        (si, sj, sk) size of ROI in voxels
    """
    data = img.get_fdata()
    ci, cj, ck = center_voxel
    si, sj, sk = size
    
    # Calculate bounds
    i_start = max(0, ci - si // 2)
    i_end = min(data.shape[0], ci + si // 2 + 1)
    j_start = max(0, cj - sj // 2)
    j_end = min(data.shape[1], cj + sj // 2 + 1)
    k_start = max(0, ck - sk // 2)
    k_end = min(data.shape[2], ck + sk // 2 + 1)
    
    return data[i_start:i_end, j_start:j_end, k_start:k_end]

# ============================================================
# 7. INTENSITY OPERATIONS
# ============================================================

def zscore_normalize(img: nib.Nifti1Image, mask: np.ndarray = None) -> nib.Nifti1Image:
    """
    Z-score normalize image intensities.
    Optional mask to compute mean/std only within region.
    """
    data = img.get_fdata()
    
    if mask is not None:
        vals = data[mask > 0]
    else:
        vals = data[data > 0]
    
    mean = np.mean(vals)
    std = np.std(vals)
    
    normalized = (data - mean) / (std + 1e-8)
    if mask is not None:
        normalized[mask == 0] = 0
    
    return nib.Nifti1Image(normalized.astype(np.float32), img.affine, img.header)

def winsorize_intensities(
    img: nib.Nifti1Image,
    lower_percentile: float = 0.5,
    upper_percentile: float = 99.5
) -> nib.Nifti1Image:
    """
    Winsorize intensity values at specified percentiles.
    Robust normalization for images with outliers.
    """
    data = img.get_fdata()
    lower = np.percentile(data[data > 0], lower_percentile)
    upper = np.percentile(data[data > 0], upper_percentile)
    
    winsorized = np.clip(data, lower, upper)
    
    return nib.Nifti1Image(winsorized.astype(np.float32), img.affine, img.header)

# ============================================================
# 8. HEADER MANIPULATION
# ============================================================

def update_affine(
    img: nib.Nifti1Image,
    new_affine: np.ndarray,
    sform_code: int = 1
) -> nib.Nifti1Image:
    """
    Update the affine transformation of an image.
    Properly updates both sform and qform for compatibility.
    """
    new_img = img.__class__(img.get_fdata(), new_affine, img.header)
    new_img.set_sform(new_affine, code=sform_code)
    new_img.set_qform(new_affine, code=sform_code)
    return new_img

def copy_header_info(
    source: nib.Nifti1Image,
    data: np.ndarray,
    dtype: np.dtype = None
) -> nib.Nifti1Image:
    """
    Create a new image with data from one source and header/affine from another.
    Useful for creating derived images (masks, segmentations) in the same space.
    """
    if dtype is None:
        dtype = data.dtype
    new_img = source.__class__(data.astype(dtype), source.affine, source.header)
    return new_img
```

---

### 3.2 nilearn

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/nilearn/nilearn |
| **License** | BSD-3-Clause |
| **PyPI** | https://pypi.org/project/nilearn/ |
| **Installation** | `pip install nilearn` |
| **Integration Complexity** | 2/5 (Low - scikit-learn API patterns) |
| **Clinical Relevance** | 5/5 (Essential for neuroimaging ML/analysis) |
| **Stars** | 1,200+ |

#### Overview

nilearn is a Python module for **fast and easy statistical learning on NeuroImaging data**. It leverages scikit-learn for multivariate statistics with applications in predictive modeling, classification, decoding, connectivity analysis, and visualization. It also provides excellent tools for image manipulation and visualization.

#### Installation

```bash
# Base installation
pip install nilearn

# With plotting and full dependencies
pip install nilearn[plotting,plotly]

# Clinical stack
pip install nilearn scikit-learn pandas matplotlib plotly
```

#### Clinical Code Examples

```python
"""
nilearn: Neuroimaging Analysis & Visualization
-----------------------------------------------
Purpose: Statistical analysis, machine learning on MRI data,
         connectivity analysis, and publication-quality visualization.
"""

import nilearn
from nilearn import image as nli
from nilearn import plotting
from nilearn.datasets import (
    fetch_atlas_harvard_oxford,
    fetch_atlas_aal,
    fetch_icbm152_2009,
    load_mni152_template,
    load_mni152_brain_mask
)
from nilearn.input_data import NiftiMasker
from nilearn.connectome import ConnectivityMeasure
from nilearn.decomposition import CanICA
import nibabel as nib
import numpy as np
import matplotlib.pyplot as plt

# ============================================================
# 1. IMAGE LOADING & MANIPULATION
# ============================================================

# Load image
t1 = nli.load_img('brain_t1.nii.gz')
print(f"Shape: {t1.shape}")

# Smooth image (Gaussian smoothing)
smoothed = nli.smooth_img(t1, fwhm=6)  # 6mm FWHM
nib.save(smoothed, 'brain_t1_smoothed.nii.gz')

# Resample to different resolution
mni = load_mni152_template()
t1_mni = nli.resample_to_img(t1, mni)

# Apply mask
masked = nli.math_img('img * mask', img=t1, mask=load_mni152_brain_mask())

# Calculate mean image across time (for 4D fMRI)
# fmri_mean = nli.mean_img(fmri_4d)

# Index a single volume from 4D
# vol_10 = nli.index_img(fmri_4d, 10)

# ============================================================
# 2. PUBLICATION-QUALITY VISUALIZATION
# ============================================================

def plot_anatomical_slice(
    anat_img: str,
    title: str = 'Anatomical MRI',
    cut_coords: tuple = None,
    output_file: str = None
):
    """
    Plot an anatomical image with optional overlay.
    """
    display = plotting.plot_anat(
        anat_img,
        title=title,
        cut_coords=cut_coords,
        display_mode='ortho',  # 'ortho', 'x', 'y', 'z', 'yx', etc.
        draw_cross=True,
        annotate=True
    )
    if output_file:
        display.savefig(output_file, dpi=300)
    display.close()
    return display

def plot_statistical_map(
    stat_img: str,
    bg_img: str = None,
    threshold: float = 2.3,
    title: str = 'Statistical Map',
    cut_coords: tuple = None,
    output_file: str = None,
    colorbar: bool = True,
    vmax: float = None
):
    """
    Plot a statistical map overlaid on anatomical background.
    Standard for fMRI/group analysis results.
    """
    if bg_img is None:
        bg_img = load_mni152_template()
    
    display = plotting.plot_stat_map(
        stat_img,
        bg_img=bg_img,
        threshold=threshold,
        title=title,
        cut_coords=cut_coords,
        colorbar=colorbar,
        vmax=vmax,
        display_mode='ortho',
        draw_cross=True,
        annotate=True
    )
    if output_file:
        display.savefig(output_file, dpi=300)
    display.close()
    return display

def plot_roi_overlays(
    anat_img: str,
    roi_img: str,
    title: str = 'ROI Overlay',
    output_file: str = None,
    cmap: str = 'Paired'
):
    """
    Plot ROI atlas overlay on anatomical image.
    """
    display = plotting.plot_roi(
        roi_img=roi_img,
        bg_img=anat_img,
        title=title,
        display_mode='ortho',
        draw_cross=False,
        cmap=plt.cm.get_cmap(cmap),
        alpha=0.7
    )
    if output_file:
        display.savefig(output_file, dpi=300)
    display.close()
    return display

def create_glass_brain_plot(
    stat_img: str,
    title: str = 'Glass Brain',
    threshold: float = 2.3,
    output_file: str = None,
    plot_abs: bool = True,
    colorbar: bool = True
):
    """
    Create glass brain plot showing activations on transparent brain.
    Excellent for group-level results overview.
    """
    display = plotting.plot_glass_brain(
        stat_img,
        title=title,
        threshold=threshold,
        plot_abs=plot_abs,
        colorbar=colorbar,
        display_mode='ortho',
        annotate=True
    )
    if output_file:
        display.savefig(output_file, dpi=300)
    display.close()
    return display

def create_connectome_plot(
    correlation_matrix: np.ndarray,
    coords: list,
    title: str = 'Functional Connectome',
    edge_threshold: str = '90%',
    output_file: str = None
):
    """
    Plot connectome as graph on glass brain.
    """
    display = plotting.plot_connectome(
        adjacency_matrix=correlation_matrix,
        node_coords=coords,
        title=title,
        edge_threshold=edge_threshold,
        node_size=20,
        node_color='auto',
        display_mode='ortho'
    )
    if output_file:
        display.savefig(output_file, dpi=300)
    display.close()
    return display

# ============================================================
# 3. INTERACTIVE 3D PLOTS
# ============================================================

def create_interactive_brain_view(
    stat_img: str,
    threshold: float = 2.0,
    output_html: str = 'brain_view.html'
):
    """
    Create interactive 3D brain viewer as HTML.
    Can be opened in browser or embedded in notebooks.
    """
    view = plotting.view_img(
        stat_img,
        threshold=threshold,
        colorbar=True,
        title='Interactive Brain View'
    )
    view.save_as_html(output_html)
    return output_html

def create_interactive_connectome(
    correlation_matrix: np.ndarray,
    coords: list,
    output_html: str = 'connectome_view.html'
):
    """
    Create interactive 3D connectome viewer.
    """
    view = plotting.view_connectome(
        correlation_matrix,
        coords,
        edge_threshold='90%',
        linewidth=6.0
    )
    view.open_in_browser()  # Or save_as_html()
    return view

# ============================================================
# 4. MASKING & ROI EXTRACTION
# ============================================================

def extract_brain_masked_timeseries(
    fmri_img: str,
    mask_img: str = None,
    standardize: bool = True,
    detrend: bool = True,
    low_pass: float = None,
    high_pass: float = 0.01,
    t_r: float = 2.0
) -> np.ndarray:
    """
    Extract voxel-level timeseries within a brain mask.
    Standard preprocessing for fMRI analysis.
    
    Parameters:
    -----------
    fmri_img : str
        4D fMRI NIfTI file
    mask_img : str
        Binary brain mask
    standardize : bool
        Z-score normalize each voxel's timeseries
    detrend : bool
        Remove linear trend
    low_pass/high_pass : float
        Frequency filter bounds in Hz
    t_r : float
        Repetition time in seconds
    """
    masker = NiftiMasker(
        mask_img=mask_img,
        standardize=standardize,
        detrend=detrend,
        low_pass=low_pass,
        high_pass=high_pass,
        t_r=t_r,
        memory='nilearn_cache',
        verbose=0
    )
    
    timeseries = masker.fit_transform(fmri_img)
    return timeseries, masker

def extract_roi_timeseries(
    fmri_img: str,
    atlas_img: str,
    labels: list = None,
    standardize: bool = True
) -> tuple:
    """
    Extract average timeseries per ROI from atlas.
    Returns timeseries matrix (n_timepoints x n_rois) and labels.
    """
    from nilearn.input_data import NiftiLabelsMasker
    
    masker = NiftiLabelsMasker(
        labels_img=atlas_img,
        labels=labels,
        standardize=standardize,
        memory='nilearn_cache'
    )
    
    timeseries = masker.fit_transform(fmri_img)
    return timeseries, masker.labels_

# ============================================================
# 5. CONNECTIVITY ANALYSIS
# ============================================================

def compute_functional_connectivity(
    timeseries_list: list[np.ndarray],
    kind: str = 'correlation'
) -> tuple:
    """
    Compute functional connectivity matrices from timeseries.
    
    Parameters:
    -----------
    timeseries_list : list[np.ndarray]
        List of (n_timepoints x n_rois) timeseries arrays
    kind : str
        'correlation', 'partial correlation', 'covariance', etc.
    
    Returns:
    --------
    connectivity_matrices : np.ndarray
        (n_subjects x n_rois x n_rois) connectivity matrices
    """
    connectivity = ConnectivityMeasure(kind=kind)
    matrices = connectivity.fit_transform(timeseries_list)
    return matrices, connectivity

# ============================================================
# 6. INDEPENDENT COMPONENT ANALYSIS (ICA)
# ============================================================

def run_canica(
    fmri_images: list[str],
    n_components: int = 20,
    mask_img: str = None,
    output_dir: str = './canica_output'
) -> CanICA:
    """
    Run Canonical ICA on fMRI data for resting-state network extraction.
    
    Parameters:
    -----------
    fmri_images : list[str]
        List of 4D fMRI file paths
    n_components : int
        Number of ICA components to extract
    mask_img : str
        Brain mask
    output_dir : str
        Output directory for component images
    """
    canica = CanICA(
        n_components=n_components,
        mask=mask_img,
        smoothing_fwhm=6,
        memory='nilearn_cache',
        memory_level=2,
        random_state=0,
        n_jobs=1,
        verbose=1
    )
    
    canica.fit(fmri_images)
    
    # Save component images
    import os
    os.makedirs(output_dir, exist_ok=True)
    for i, img in enumerate(canica.components_img_.iter_img()):
        nib.save(img, f"{output_dir}/component_{i:02d}.nii.gz")
    
    return canica
```

---

### 3.3 nitransforms

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/nipy/nitransforms |
| **License** | Apache 2.0 |
| **PyPI** | https://pypi.org/project/nitransforms/ |
| **Installation** | `pip install nitransforms` |
| **Integration Complexity** | 3/5 (Medium - requires transform format knowledge) |
| **Clinical Relevance** | 4/5 (Essential for reproducible spatial transforms) |
| **Stars** | 100+ |

#### Overview

NiTransforms is a Python tool to **read, represent, manipulate, and apply N-dimensional spatial transforms**. It converts between transform formats from the most popular neuroimaging packages (AFNI, FSL, FreeSurfer, ITK, SPM) and resamples images accordingly. It ensures **reproducibility and interoperability** across different registration tools.

#### Installation

```bash
pip install nitransforms

# With full dependencies
pip install nitransforms[nibabel,scipy]
```

#### Clinical Code Examples

```python
"""
nitransforms: Spatial Transform Management
--------------------------------------------
Purpose: Convert between transform formats, apply transforms to images,
         and ensure reproducible spatial normalization across tools.
"""

import nitransforms as nt
from nitransforms.io import (
    load as load_transform,
    afni, fsl, itk, cifti
)
from nitransforms.linear import Affine
from nitransforms.nonlinear import DisplacementsFieldTransform
import nibabel as nib
import numpy as np
from pathlib import Path

# ============================================================
# 1. LOADING TRANSFORMS FROM DIFFERENT TOOLS
# ============================================================

def load_any_transform(transform_path: str, reference: str = None):
    """
    Load a transform file regardless of source tool format.
    Automatically detects format and creates appropriate object.
    
    Supported formats:
    - ITK/ANTs: .tfm, .mat, .txt
    - FSL: .mat (FLIRT), .nii.gz (FNIRT)
    - AFNI: .1D, .1Dparam.1D, .niml.affine
    - FreeSurfer: .lta, .xfm
    - CIFTI: .dseries.nii
    """
    transform = nt.io.load(transform_path, fmt=None)  # Auto-detect format
    return transform

# Load FSL transform
# fsl_xfm = load_any_transform('flirt.mat')

# Load ITK/ANTs transform
# itk_xfm = load_any_transform('ants_Affine.mat')

# Load AFNI transform
# afni_xfm = load_any_transform('3dAllineate.1D')

# ============================================================
# 2. CONVERTING BETWEEN TRANSFORM FORMATS
# ============================================================

def convert_transform(
    input_path: str,
    output_path: str,
    input_format: str = None,  # Auto-detect if None
    output_format: str = 'itk'  # Target format
):
    """
    Convert a transform from one software format to another.
    
    Parameters:
    -----------
    input_path : str
        Path to input transform file
    output_path : str
        Path for output transform file
    input_format : str
        Source format ('fsl', 'itk', 'afni', 'freesurfer')
    output_format : str
        Target format ('itk', 'fsl', 'afni', 'freesurfer')
    """
    # Load transform
    transform = load_transform(input_path, fmt=input_format)
    
    # Convert to target format's internal representation
    if output_format == 'itk':
        converted = transform.to_itk()
    elif output_format == 'fsl':
        converted = transform.to_fsl()
    elif output_format == 'afni':
        converted = transform.to_afni()
    elif output_format == 'freesurfer':
        converted = transform.to_freesurfer()
    else:
        raise ValueError(f"Unknown output format: {output_format}")
    
    # Save
    converted.to_filename(output_path)
    return output_path

# Example: FSL -> ITK conversion (for ANTs/SimpleITK compatibility)
# convert_transform('flirt_output.mat', 'ants_compatible.tfm', 
#                   input_format='fsl', output_format='itk')

# ============================================================
# 3. APPLYING TRANSFORMS TO IMAGES
# ============================================================

def apply_transform_to_image(
    image_path: str,
    transform_path: str,
    reference_path: str,
    output_path: str,
    interpolation: str = 'linear'
) -> str:
    """
    Apply a spatial transform to resample an image.
    
    Parameters:
    -----------
    image_path : str
        Input image to transform
    transform_path : str
        Transform file (auto-detects format)
    reference_path : str
        Reference image defining output space
    output_path : str
        Output resampled image
    interpolation : str
        'nearest', 'linear', or 'cubic'
    """
    # Load components
    img = nib.load(image_path)
    transform = load_transform(transform_path)
    reference = nib.load(reference_path)
    
    # Apply transform
    resampled = transform.apply(
        img,
        reference=reference,
        order=1 if interpolation == 'linear' else 0
    )
    
    nib.save(resampled, output_path)
    return output_path

def apply_transform_to_coordinates(
    coordinates: np.ndarray,
    transform_path: str,
    direction: str = 'forward'
) -> np.ndarray:
    """
    Apply a transform to a set of coordinates (not resampling).
    
    Parameters:
    -----------
    coordinates : np.ndarray
        (N, 3) array of (x, y, z) coordinates in mm
    transform_path : str
        Transform file
    direction : str
        'forward' (source->reference) or 'inverse' (reference->source)
    """
    transform = load_transform(transform_path)
    
    if direction == 'inverse':
        mapped = transform.map(coordinates, inverse=True)
    else:
        mapped = transform.map(coordinates)
    
    return mapped

# ============================================================
# 4. COMPOSING MULTIPLE TRANSFORMS
# ============================================================

def compose_transforms(
    transform_paths: list[str],
    output_path: str
):
    """
    Compose multiple transforms into a single transform.
    Applies in order: first transform in list is applied first.
    
    For example: [rigid.tfm, affine.tfm, warp.nii.gz]
    applies rigid, then affine, then warp.
    """
    transforms = [load_transform(p) for p in transform_paths]
    
    # Compose: t_total = t_n @ ... @ t_2 @ t_1
    composed = transforms[0]
    for t in transforms[1:]:
        composed = t @ composed  # Matrix composition
    
    composed.to_filename(output_path)
    return output_path

# ============================================================
# 5. NON-LINEAR (DEFORMABLE) TRANSFORMS
# ============================================================

def apply_deformable_transform(
    image_path: str,
    displacement_field_path: str,
    reference_path: str,
    output_path: str
) -> str:
    """
    Apply a displacement field transform (from ANTs/SyN, SPM DARTEL, etc.)
    
    Parameters:
    -----------
    displacement_field_path : str
        Path to displacement field NIfTI (3-vector per voxel)
    """
    img = nib.load(image_path)
    ref = nib.load(reference_path)
    
    # Load displacement field
    disp_field = DisplacementsFieldTransform(
        displacement_field_path,
        reference=ref
    )
    
    # Apply
    resampled = disp_field.apply(img, reference=ref)
    nib.save(resampled, output_path)
    return output_path
```

---

### 3.4 templateflow

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/templateflow/templateflow |
| **Project** | https://www.templateflow.org/ |
| **License** | Apache 2.0 |
| **PyPI** | https://pypi.org/project/templateflow/ |
| **Installation** | `pip install templateflow` |
| **Integration Complexity** | 2/5 (Low - simple query-based API) |
| **Clinical Relevance** | 4/5 (Essential for standardization) |
| **Stars** | 200+ |

#### Overview

TemplateFlow is a **modular, version-controlled resource** that allows researchers to programmatically access neuroimaging templates and atlases. It provides unified access to MNI152 variants, fsaverage, infant templates, and rodent templates with lazy loading from cloud storage.

#### Installation

```bash
pip install templateflow

# Set cache directory (optional, defaults to ~/.cache/templateflow)
export TEMPLATEFLOW_HOME=/path/to/templateflow
```

#### Clinical Code Examples

```python
"""
templateflow: Neuroimaging Template Management
----------------------------------------------
Purpose: Programmatic access to standardized brain templates and atlases
         for spatial normalization, visualization, and analysis.
"""

from templateflow import api as tflow
from templateflow.conf import TF_HOME, TF_GITHUB_SOURCE, TF_S3_ROOT
import nibabel as nib
from pathlib import Path

# ============================================================
# 1. BASIC TEMPLATE RETRIEVAL
# ============================================================

# MNI152 template (most common for neuroimaging)
mni_t1 = tflow.get('MNI152NLin2009cAsym', desc=None, resolution=1,
                    suffix='T1w', extension='nii.gz')
print(f"MNI152 T1w: {mni_t1}")
# Output: /home/user/.cache/templateflow/tpl-MNI152NLin2009cAsym/...

# MNI152 brain mask
mni_mask = tflow.get('MNI152NLin2009cAsym', desc='brain', resolution=1,
                     suffix='mask', extension='nii.gz')

# MNI152 TPM (tissue probability maps)
mni_tpm = tflow.get('MNI152NLin2009cAsym', resolution=1,
                    suffix='probseg', extension='nii.gz')

# ============================================================
# 2. DIFFERENT MNI VARIANTS
# ============================================================

def get_mni_variants():
    """
    Available MNI152 variants for different use cases:
    - MNI152NLin2009cAsym: FSL/ANTs standard (most common)
    - MNI152NLin6Asym: SPM standard
    - MNI152NLin2009cSym: Symmetric version
    """
    variants = {
        'fmriprep_default': tflow.get('MNI152NLin2009cAsym', resolution=2,
                                       suffix='T1w', extension='nii.gz'),
        'fsl_default': tflow.get('MNI152NLin2009cAsym', resolution=1,
                                  suffix='T1w', extension='nii.gz'),
        'spm_default': tflow.get('MNI152NLin6Asym', resolution=1,
                                  suffix='T1w', extension='nii.gz'),
    }
    return variants

# ============================================================
# 3. ATLASES AND PARCELLATIONS
# ============================================================

def get_common_atlases():
    """Retrieve common atlases for ROI analysis."""
    atlases = {}
    
    # Harvard-Oxford cortical/subcortical
    atlases['harvard_oxford'] = {
        'cortical_maxprob': tflow.get(
            'MNI152NLin2009cAsym', resolution=1, atlas='HOCPA',
            suffix='dseg', extension='nii.gz'
        ),
        'subcortical_maxprob': tflow.get(
            'MNI152NLin2009cAsym', resolution=1, atlas='HOSPA',
            suffix='dseg', extension='nii.gz'
        ),
    }
    
    # Schaefer 2018 parcellation (100-1000 parcels)
    atlases['schaefer'] = {
        '400_7networks': tflow.get(
            'MNI152NLin2009cAsym', resolution=1,
            atlas='Schaefer2018', desc='400Parcels7Networks',
            suffix='dseg', extension='nii.gz'
        ),
    }
    
    # AAL (Automated Anatomical Labeling)
    atlases['aal'] = tflow.get(
        'MNI152NLin2009cAsym', resolution=1,
        atlas='AAL', suffix='dseg', extension='nii.gz'
    )
    
    return atlases

# ============================================================
# 4. SURFACE TEMPLATES
# ============================================================

def get_surface_templates():
    """Get surface-based templates (FreeSurfer fsaverage)."""
    fsaverage_t1 = tflow.get('fsaverage', suffix='T1w', extension='surf.gii')
    fsaverage_pial = tflow.get('fsaverage', suffix='pial', extension='surf.gii')
    fsaverage_white = tflow.get('fsaverage', suffix='white', extension='surf.gii')
    fsaverage_inflated = tflow.get('fsaverage', suffix='inflated', extension='surf.gii')
    
    return {
        'T1w': fsaverage_t1,
        'pial': fsaverage_pial,
        'white': fsaverage_white,
        'inflated': fsaverage_inflated,
    }

# ============================================================
# 5. INFANT AND PEDIATRIC TEMPLATES
# ============================================================

def get_infant_template(age_months: int = 12):
    """
    Get age-appropriate infant template.
    
    Parameters:
    -----------
    age_months : int
        Age in months for template selection
    """
    if age_months <= 12:
        template = tflow.get('MNIInfant', cohort=1, resolution=1,
                             suffix='T1w', extension='nii.gz')
    elif age_months <= 24:
        template = tflow.get('MNIInfant', cohort=2, resolution=1,
                             suffix='T1w', extension='nii.gz')
    else:
        # Use pediatric template
        template = tflow.get('MNIPediatricAsym', cohort=age_months//12,
                             resolution=1, suffix='T1w', extension='nii.gz')
    return template

# ============================================================
# 6. LISTING AVAILABLE TEMPLATES
# ============================================================

def list_available_templates():
    """List all templates available in TemplateFlow archive."""
    templates = tflow.templates()
    return sorted(templates)

def list_template_files(template: str):
    """List all files available for a specific template."""
    files = tflow.get(template)
    return files

# ============================================================
# 7. CLINICAL PIPELINE EXAMPLE: TEMPLATE-BASED ANALYSIS
# ============================================================

def prepare_template_space_analysis(
    patient_t1_path: str,
    output_dir: str,
    template_name: str = 'MNI152NLin2009cAsym',
    resolution: int = 1
):
    """
    Prepare a complete template-space analysis with all required files.
    Downloads all necessary template files automatically.
    
    Returns dict with all file paths needed for analysis.
    """
    import os
    os.makedirs(output_dir, exist_ok=True)
    
    template_files = {
        'reference': tflow.get(template_name, resolution=resolution,
                               suffix='T1w', extension='nii.gz'),
        'brain_mask': tflow.get(template_name, resolution=resolution,
                                desc='brain', suffix='mask', extension='nii.gz'),
        'tissue_probability': tflow.get(template_name, resolution=resolution,
                                        suffix='probseg', extension='nii.gz'),
        'patient_native': patient_t1_path,
    }
    
    # Get atlas for ROI analysis
    try:
        template_files['atlas'] = tflow.get(
            template_name, resolution=resolution,
            atlas='Schaefer2018', desc='400Parcels7Networks',
            suffix='dseg', extension='nii.gz'
        )
    except Exception as e:
        print(f"Could not load atlas: {e}")
    
    return template_files
```

---

### 3.5 pyBIDS

| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/bids-standard/pybids |
| **License** | MIT |
| **PyPI** | https://pypi.org/project/pybids/ |
| **Installation** | `pip install pybids` |
| **Integration Complexity** | 2/5 (Low - intuitive query API) |
| **Clinical Relevance** | 4/5 (Essential for BIDS-compliant datasets) |
| **Stars** | 600+ |

#### Overview

PyBIDS is a Python library for querying and manipulating **BIDS (Brain Imaging Data Structure)** datasets. It provides powerful indexing, searching, and reporting capabilities for neuroimaging datasets organized in the BIDS standard.

#### Installation

```bash
pip install pybids

# With plotting
pip install pybids[plotting]

# Full installation
pip install pybids[analysis,plotting]
```

#### Clinical Code Examples

```python
"""
pyBIDS: BIDS Dataset Management
---------------------------------
Purpose: Query, index, and manage MRI datasets organized in BIDS format.
         Essential for reproducible neuroimaging research pipelines.
"""

import bids
from bids import BIDSLayout
from bids.reports import BIDSReport
import pandas as pd
from pathlib import Path

# ============================================================
# 1. LOADING & INDEXING A BIDS DATASET
# ============================================================

def load_bids_dataset(bids_root: str) -> BIDSLayout:
    """
    Load and index a BIDS dataset.
    
    Parameters:
    -----------
    bids_root : str
        Path to the root directory of the BIDS dataset
        (contains dataset_description.json at top level)
    """
    layout = BIDSLayout(bids_root)
    return layout

# Usage
# layout = load_bids_dataset('/data/bids_dataset/')

# ============================================================
# 2. QUERYING FILES
# ============================================================

def get_subject_anat_files(layout: BIDSLayout, subject: str) -> list:
    """Get all anatomical files for a subject."""
    return layout.get(
        subject=subject,
        datatype='anat',
        extension=['.nii.gz', '.nii'],
        return_type='filename'
    )

def get_subject_func_files(layout: BIDSLayout, subject: str,
                           task: str = None) -> list:
    """Get all functional files for a subject, optionally filtered by task."""
    filters = {
        'subject': subject,
        'datatype': 'func',
        'suffix': 'bold',
        'extension': ['.nii.gz', '.nii'],
        'return_type': 'filename'
    }
    if task:
        filters['task'] = task
    return layout.get(**filters)

def get_fieldmap_files(layout: BIDSLayout, subject: str) -> list:
    """Get field map files for distortion correction."""
    return layout.get(
        subject=subject,
        datatype='fmap',
        extension=['.nii.gz', '.nii'],
        return_type='filename'
    )

def get_all_participants(layout: BIDSLayout) -> list:
    """Get list of all subject IDs in dataset."""
    subjects = layout.get_subjects()
    return sorted(subjects)

def get_all_tasks(layout: BIDSLayout) -> list:
    """Get list of all task names in dataset."""
    tasks = layout.get_tasks()
    return sorted(tasks)

# ============================================================
# 3. METADATA ACCESS
# ============================================================

def get_scan_metadata(layout: BIDSLayout, file_path: str) -> dict:
    """
    Get metadata for a specific file from sidecar JSON.
    
    Returns dict with acquisition parameters:
    - RepetitionTime, EchoTime, SliceTiming, etc.
    """
    metadata = layout.get_metadata(file_path)
    return metadata

def get_subject_demographics(layout: BIDSLayout) -> pd.DataFrame:
    """
    Get participant demographics from participants.tsv.
    """
    participants_file = Path(layout.root) / 'participants.tsv'
    if participants_file.exists():
        df = pd.read_csv(participants_file, sep='\t')
        return df
    return pd.DataFrame()

# ============================================================
# 4. ADVANCED QUERIES
# ============================================================

def get_files_by_multiple_criteria(layout: BIDSLayout,
                                    subjects: list = None,
                                    sessions: list = None,
                                    datatypes: list = None,
                                    suffixes: list = None,
                                    extensions: list = None) -> list:
    """
    Query files using multiple criteria simultaneously.
    All criteria are AND-combined.
    """
    query = {'return_type': 'filename'}
    if subjects:
        query['subject'] = subjects
    if sessions:
        query['session'] = sessions
    if datatypes:
        query['datatype'] = datatypes
    if suffixes:
        query['suffix'] = suffixes
    if extensions:
        query['extension'] = extensions
    return layout.get(**query)

def get_scans_dataframe(layout: BIDSLayout, **filters) -> pd.DataFrame:
    """
    Get files as a pandas DataFrame with all entity columns.
    Excellent for creating analysis manifests.
    """
    files = layout.get(return_type='object', **filters)
    
    rows = []
    for f in files:
        row = dict(f.entities)
        row['path'] = f.path
        rows.append(row)
    
    return pd.DataFrame(rows)

# ============================================================
# 5. BIDS REPORT GENERATION
# ============================================================

def generate_dataset_report(layout: BIDSLayout) -> str:
    """
    Generate a human-readable report of the BIDS dataset contents.
    """
    report = BIDSReport(layout)
    descriptions = report.generate()
    
    output = []
    for desc in descriptions:
        output.append(str(desc))
    
    return '\n\n'.join(output)

# ============================================================
# 6. MRI SEQUENCE FILTERING
# ============================================================

def get_t1w_files(layout: BIDSLayout, subject: str = None) -> list:
    """Get T1-weighted anatomical images."""
    filters = {'suffix': 'T1w', 'extension': ['.nii.gz', '.nii'],
               'return_type': 'filename'}
    if subject:
        filters['subject'] = subject
    return layout.get(**filters)

def get_t2w_files(layout: BIDSLayout, subject: str = None) -> list:
    """Get T2-weighted anatomical images."""
    filters = {'suffix': 'T2w', 'extension': ['.nii.gz', '.nii'],
               'return_type': 'filename'}
    if subject:
        filters['subject'] = subject
    return layout.get(**filters)

def get_flair_files(layout: BIDSLayout, subject: str = None) -> list:
    """Get FLAIR images."""
    filters = {'suffix': 'FLAIR', 'extension': ['.nii.gz', '.nii'],
               'return_type': 'filename'}
    if subject:
        filters['subject'] = subject
    return layout.get(**filters)

# ============================================================
# 7. CLINICAL WORKFLOW: CREATE ANALYSIS MANIFEST
# ============================================================

def create_analysis_manifest(
    bids_root: str,
    output_csv: str = 'analysis_manifest.csv',
    required_modalities: list = ['T1w', 'T2w', 'FLAIR']
) -> pd.DataFrame:
    """
    Create a CSV manifest of all available data for analysis.
    Filters to subjects with all required modalities.
    """
    layout = BIDSLayout(bids_root)
    
    subjects = layout.get_subjects()
    records = []
    
    for subj in subjects:
        record = {'subject': subj}
        has_all = True
        
        for modality in required_modalities:
            files = layout.get(
                subject=subj,
                suffix=modality,
                extension=['.nii.gz', '.nii']
            )
            if files:
                record[f'{modality}_path'] = files[0].path
            else:
                record[f'{modality}_path'] = ''
                has_all = False
        
        record['has_all_modalities'] = has_all
        records.append(record)
    
    df = pd.DataFrame(records)
    df.to_csv(output_csv, index=False)
    return df
```

---

## 4. Metadata & Quality Assurance

### 4.1 DICOM Tag Extraction

```python
"""
DICOM Tag Extraction for MRI Quality Control
----------------------------------------------
Purpose: Systematic extraction and validation of DICOM metadata
         for MRI sequence identification and quality assurance.
"""

import pydicom
from pydicom import dcmread
from pydicom.dataset import Dataset
import pandas as pd
import numpy as np
from pathlib import Path
from collections import defaultdict
import json

# ============================================================
# ESSENTIAL DICOM TAGS FOR MRI QC
# ============================================================

MRI_ESSENTIAL_TAGS = {
    # Patient & Study
    'PatientID': (0x0010, 0x0020),
    'PatientAge': (0x0010, 0x1010),
    'PatientSex': (0x0010, 0x0040),
    'StudyDate': (0x0008, 0x0020),
    'StudyTime': (0x0008, 0x0030),
    'StudyInstanceUID': (0x0020, 0x000D),
    'StudyDescription': (0x0008, 0x1030),
    'AccessionNumber': (0x0008, 0x0050),
    
    # Series
    'SeriesNumber': (0x0020, 0x0011),
    'SeriesDescription': (0x0008, 0x103E),
    'SeriesInstanceUID': (0x0020, 0x000E),
    'Modality': (0x0008, 0x0060),
    'ProtocolName': (0x0018, 0x1030),
    
    # Scanner
    'Manufacturer': (0x0008, 0x0070),
    'ManufacturerModelName': (0x0008, 0x1090),
    'MagneticFieldStrength': (0x0018, 0x0087),
    'DeviceSerialNumber': (0x0018, 0x1000),
    'InstitutionName': (0x0008, 0x0080),
    'StationName': (0x0008, 0x1010),
    
    # Sequence Parameters
    'RepetitionTime': (0x0018, 0x0080),
    'EchoTime': (0x0018, 0x0081),
    'InversionTime': (0x0018, 0x0082),
    'FlipAngle': (0x0018, 0x1314),
    'EchoTrainLength': (0x0018, 0x0091),
    'ScanningSequence': (0x0018, 0x0020),
    'SequenceVariant': (0x0018, 0x0021),
    'ScanOptions': (0x0018, 0x0022),
    'MRAcquisitionType': (0x0018, 0x0023),  # 2D/3D
    'PulseSequenceName': (0x0018, 0x9005),
    
    # Geometry
    'SliceThickness': (0x0018, 0x0050),
    'SpacingBetweenSlices': (0x0018, 0x0088),
    'PixelSpacing': (0x0028, 0x0030),
    'Rows': (0x0028, 0x0010),
    'Columns': (0x0028, 0x0011),
    'ImageOrientationPatient': (0x0020, 0x0037),
    'ImagePositionPatient': (0x0020, 0x0032),
    'SliceLocation': (0x0020, 0x1041),
    'NumberOfPhaseEncodingSteps': (0x0018, 0x0089),
    'PercentSampling': (0x0018, 0x0093),
    'PercentPhaseFieldOfView': (0x0018, 0x0094),
    
    # Instance
    'InstanceNumber': (0x0020, 0x0013),
    'SOPInstanceUID': (0x0008, 0x0018),
    'ContentDate': (0x0008, 0x0023),
    
    # Optional: Multi-frame
    'NumberOfFrames': (0x0028, 0x0008),
    'FrameAcquisitionNumber': (0x0020, 0x9112),
}

def extract_all_mri_tags(dicom_path: str) -> dict:
    """
    Extract all MRI-relevant DICOM tags from a file.
    Returns dict with tag names and values.
    """
    ds = dcmread(dicom_path, force=True)
    result = {}
    
    for tag_name, (group, element) in MRI_ESSENTIAL_TAGS.items():
        try:
            elem = ds[group, element]
            if elem.VR == 'DS':  # Decimal String
                result[tag_name] = float(elem.value)
            elif elem.VR == 'IS':  # Integer String
                result[tag_name] = int(elem.value)
            elif elem.VR == 'SQ':  # Sequence
                result[tag_name] = f"<Sequence with {len(elem.value)} items>"
            else:
                result[tag_name] = str(elem.value)
        except (KeyError, ValueError, TypeError):
            result[tag_name] = None
    
    return result

def extract_series_metadata_to_dataframe(dicom_dir: str) -> pd.DataFrame:
    """
    Extract metadata from all DICOM files in a directory to a DataFrame.
    """
    records = []
    for fpath in Path(dicom_dir).rglob('*'):
        if fpath.is_file():
            try:
                tags = extract_all_mri_tags(str(fpath))
                tags['filepath'] = str(fpath)
                records.append(tags)
            except Exception:
                continue
    
    return pd.DataFrame(records)

# ============================================================
# SEQUENCE IDENTIFICATION HEURISTICS
# ============================================================

def identify_mri_sequence(
    series_description: str,
    tr: float = None,
    te: float = None,
    ti: float = None,
    flip_angle: float = None
) -> str:
    """
    Identify MRI sequence type from description and parameters.
    
    Returns standardized sequence name.
    """
    desc_lower = (series_description or '').lower()
    
    # T1-weighted
    if any(kw in desc_lower for kw in ['t1', 'bravo', 'mprage', 'spgr', 'fspgr', '3dffe']):
        if 'post' in desc_lower or 'gd' in desc_lower or 'contrast' in desc_lower:
            return 'T1w_POST'
        return 'T1w'
    
    # T2-weighted
    if any(kw in desc_lower for kw in ['t2', 'cube', 'tse', 'turbo']):
        if 'flair' in desc_lower:
            return 'FLAIR'
        return 'T2w'
    
    # FLAIR
    if 'flair' in desc_lower or 'space' in desc_lower:
        return 'FLAIR'
    
    # DWI/Diffusion
    if any(kw in desc_lower for kw in ['dwi', 'diff', 'dti', 'diffusion']):
        if 'adc' in desc_lower:
            return 'ADC'
        if 'fa' in desc_lower:
            return 'FA'
        if 'trace' in desc_lower or 'tracew' in desc_lower:
            return 'TRACEW'
        return 'DWI'
    
    # fMRI
    if any(kw in desc_lower for kw in ['bold', 'epi', 'fmri', 'rest']):
        if 'rest' in desc_lower:
            return 'rsfMRI'
        return 'fMRI'
    
    # SWI
    if 'swi' in desc_lower or 'susceptibility' in desc_lower:
        return 'SWI'
    
    # MRA
    if 'mra' in desc_lower or 'angio' in desc_lower:
        return 'MRA'
    
    # Perfusion
    if any(kw in desc_lower for kw in ['perf', 'asl', 'pwi']):
        return 'PERFUSION'
    
    # Spectroscopy
    if 'mrs' in desc_lower or 'spectro' in desc_lower or 'csi' in desc_lower:
        return 'MRS'
    
    # Use TR/TE heuristics if description unclear
    if tr and te:
        if tr < 1000 and te < 30:
            return 'T1w'
        elif tr > 2000 and te > 80:
            return 'T2w'
        elif tr > 5000 and te > 100:
            return 'FLAIR'
        elif te < 30:
            return 'PD'  # Proton Density
    
    return 'UNKNOWN'
```

---

### 4.2 Series Organization

```python
"""
Series Organization for Clinical MRI
--------------------------------------
Purpose: Organize DICOM files by series, validate completeness,
         and prepare for conversion to volumetric formats.
"""

import pydicom
from pydicom import dcmread
from pathlib import Path
from collections import defaultdict
import numpy as np

# ============================================================
# GROUPING DICOM FILES BY SERIES
# ============================================================

def organize_dicom_series(dicom_dir: str) -> dict:
    """
    Group DICOM files by SeriesInstanceUID.
    
    Returns dict: {series_uid: {metadata, files: [sorted paths]}}
    """
    series_groups = defaultdict(lambda: {
        'series_number': None,
        'series_description': '',
        'modality': '',
        'study_uid': '',
        'files': [],
        'instance_numbers': []
    })
    
    for fpath in Path(dicom_dir).rglob('*'):
        if not fpath.is_file():
            continue
        try:
            ds = dcmread(str(fpath), stop_before_pixels=True, force=True)
            
            series_uid = ds.get('SeriesInstanceUID', '')
            if not series_uid:
                continue
            
            group = series_groups[series_uid]
            group['series_number'] = ds.get('SeriesNumber', 0)
            group['series_description'] = ds.get('SeriesDescription', '')
            group['modality'] = ds.get('Modality', '')
            group['study_uid'] = ds.get('StudyInstanceUID', '')
            group['files'].append(str(fpath))
            group['instance_numbers'].append(int(ds.get('InstanceNumber', 0)))
            
        except Exception:
            continue
    
    # Sort files by instance number within each series
    for series_uid, group in series_groups.items():
        sorted_pairs = sorted(
            zip(group['instance_numbers'], group['files'])
        )
        group['files'] = [f for _, f in sorted_pairs]
        group['instance_numbers'] = [n for n, _ in sorted_pairs]
        group['num_slices'] = len(group['files'])
    
    return dict(series_groups)

def validate_series_completeness(series_info: dict) -> dict:
    """
    Check if a DICOM series has contiguous slice coverage.
    
    Returns validation report with missing slice info.
    """
    files = series_info['files']
    instance_numbers = series_info['instance_numbers']
    
    report = {
        'total_files': len(files),
        'expected_files': None,
        'is_complete': True,
        'missing_instances': [],
        'warnings': []
    }
    
    if len(instance_numbers) >= 2:
        # Check for gaps
        diffs = np.diff(instance_numbers)
        expected_diff = np.gcd.reduce(diffs.astype(int)) if len(diffs) > 0 else 1
        
        expected = list(range(
            min(instance_numbers),
            max(instance_numbers) + 1,
            expected_diff
        ))
        
        report['expected_files'] = len(expected)
        missing = set(expected) - set(instance_numbers)
        report['missing_instances'] = sorted(missing)
        report['is_complete'] = len(missing) == 0
    
    # Check consistency of slice positions
    if len(files) > 1:
        positions = []
        for f in files[:min(10, len(files))]:
            ds = dcmread(f, stop_before_pixels=True, force=True)
            ipp = ds.get('ImagePositionPatient', [0, 0, 0])
            positions.append([float(x) for x in ipp])
        
        if len(positions) >= 2:
            pos_diffs = np.diff(positions, axis=0)
            norms = np.linalg.norm(pos_diffs, axis=1)
            if np.std(norms) / (np.mean(norms) + 1e-10) > 0.05:
                report['warnings'].append('Irregular slice spacing detected')
    
    return report
```

---

### 4.3 Slice Ordering

```python
"""
Slice Ordering for 3D Volume Reconstruction
---------------------------------------------
Purpose: Ensure correct slice ordering for 3D volume assembly
         from DICOM slices, handling various acquisition orders.
"""

import pydicom
from pydicom import dcmread
import numpy as np
from pathlib import Path

# ============================================================
# SLICE ORDERING STRATEGIES
# ============================================================

def sort_slices_by_position(dicom_files: list[str]) -> list[str]:
    """
    Sort DICOM slices by their 3D spatial position.
    Uses ImagePositionPatient to determine correct order.
    """
    slice_info = []
    
    for fpath in dicom_files:
        ds = dcmread(fpath, stop_before_pixels=True, force=True)
        
        # Get image orientation (row and column direction cosines)
        iop = ds.get('ImageOrientationPatient', [1,0,0,0,1,0])
        row_cos = np.array([float(iop[0]), float(iop[1]), float(iop[2])])
        col_cos = np.array([float(iop[3]), float(iop[4]), float(iop[5])])
        
        # Normal vector (slice direction)
        normal = np.cross(row_cos, col_cos)
        
        # Image position
        ipp = ds.get('ImagePositionPatient', [0, 0, 0])
        position = np.array([float(ipp[0]), float(ipp[1]), float(ipp[2])])
        
        # Projection onto normal gives slice ordering
        slice_location = np.dot(position, normal)
        
        slice_info.append({
            'filepath': fpath,
            'position': position,
            'normal': normal,
            'slice_location': slice_location,
            'instance_number': int(ds.get('InstanceNumber', 0))
        })
    
    # Sort by slice location
    slice_info.sort(key=lambda x: x['slice_location'])
    
    return [s['filepath'] for s in slice_info]

def detect_slice_acquisition_order(dicom_files: list[str]) -> str:
    """
    Detect slice acquisition order (sequential, interleaved, etc.)
    
    Returns: 'sequential_ascending', 'sequential_descending',
             'interleaved_ascending', 'interleaved_descending', 'unknown'
    """
    if len(dicom_files) < 3:
        return 'unknown'
    
    # Read slice times if available
    slice_times = []
    for fpath in dicom_files:
        ds = dcmread(fpath, stop_before_pixels=True, force=True)
        
        # Try to get acquisition time or trigger time
        acq_time = ds.get('AcquisitionTime', '')
        trigger_time = ds.get('TriggerTime', None)
        
        if trigger_time is not None:
            slice_times.append(float(trigger_time))
        elif acq_time:
            # Parse HHMMSS.FFFFFF format
            try:
                hours = int(acq_time[:2])
                minutes = int(acq_time[2:4])
                seconds = float(acq_time[4:])
                total_ms = (hours * 3600 + minutes * 60 + seconds) * 1000
                slice_times.append(total_ms)
            except:
                slice_times.append(0)
        else:
            slice_times.append(0)
    
    if len(slice_times) < 3 or len(set(slice_times)) < 3:
        return 'unknown'
    
    # Sort by slice position and analyze time pattern
    sorted_indices = np.argsort([s['slice_location'] for s in 
                                  [{'slice_location': 0} for _ in range(len(slice_times))]])
    
    # Check for interleaved pattern
    n = len(slice_times)
    sorted_times = [slice_times[i] for i in range(n)]
    
    # Calculate time differences between consecutive spatial slices
    diffs = np.diff(sorted_times)
    
    # If alternating large/small differences, likely interleaved
    if np.mean(np.abs(diffs[::2])) > 2 * np.mean(np.abs(diffs[1::2])):
        if sorted_times[0] < sorted_times[1]:
            return 'interleaved_ascending'
        else:
            return 'interleaved_descending'
    
    # Check for ascending/descending
    if sorted_times[0] < sorted_times[-1]:
        return 'sequential_ascending'
    else:
        return 'sequential_descending'

def build_3d_volume(dicom_files: list[str], sort_by_position: bool = True) -> np.ndarray:
    """
    Assemble a 3D volume from DICOM slice files.
    
    Parameters:
    -----------
    dicom_files : list[str]
        List of DICOM file paths
    sort_by_position : bool
        If True, sort by spatial position. If False, use instance number.
    
    Returns:
    --------
    np.ndarray : 3D volume array
    """
    if sort_by_position:
        sorted_files = sort_slices_by_position(dicom_files)
    else:
        sorted_files = sorted(
            dicom_files,
            key=lambda f: int(dcmread(f, stop_before_pixels=True, force=True).InstanceNumber)
        )
    
    # Read all slices
    slices = []
    for fpath in sorted_files:
        ds = dcmread(fpath)
        slices.append(ds.pixel_array)
    
    # Stack to 3D volume
    volume = np.stack(slices, axis=-1).astype(np.float32)
    
    # Apply rescale slope/intercept
    if sorted_files:
        ds = dcmread(sorted_files[0])
        slope = float(ds.get('RescaleSlope', 1))
        intercept = float(ds.get('RescaleIntercept', 0))
        volume = volume * slope + intercept
    
    return volume
```

---

### 4.4 Orientation Detection

```python
"""
Orientation Detection for MRI Volumes
---------------------------------------
Purpose: Determine patient orientation from DICOM headers,
         convert between orientation conventions,
         and ensure consistent RAS+ output.
"""

import pydicom
from pydicom import dcmread
import numpy as np
from nibabel.orientations import (
    axcodes2ornt, ornt2axcodes, 
    aff2axcodes, apply_orientation
)
import nibabel as nib

# ============================================================
# DICOM ORIENTATION ANALYSIS
# ============================================================

def get_patient_orientation(dicom_path: str) -> dict:
    """
    Extract orientation information from a DICOM file.
    
    Returns dict with:
    - iop: ImageOrientationPatient (row/column direction cosines)
    - ipp: ImagePositionPatient
    - orientation_label: Human-readable orientation
    - patient_position: DICOM PatientPosition (HFS, HFP, etc.)
    """
    ds = dcmread(dicom_path, stop_before_pixels=True, force=True)
    
    iop = ds.get('ImageOrientationPatient', [1, 0, 0, 0, 1, 0])
    ipp = ds.get('ImagePositionPatient', [0, 0, 0])
    patient_position = ds.get('PatientPosition', 'HFS')  # Head First Supine default
    
    # Row and column direction cosines
    row_dir = np.array([float(iop[0]), float(iop[1]), float(iop[2])])
    col_dir = np.array([float(iop[3]), float(iop[4]), float(iop[5])])
    normal = np.cross(row_dir, col_dir)
    
    # Determine orientation label
    def closest_axis(vec):
        """Find closest anatomical axis label."""
        axes = {
            'R': [1, 0, 0], 'L': [-1, 0, 0],
            'A': [0, 1, 0], 'P': [0, -1, 0],
            'S': [0, 0, 1], 'I': [0, 0, -1]
        }
        best = max(axes.items(), 
                   key=lambda a: abs(np.dot(vec, a[1])))
        return best[0] if np.dot(vec, axes[best[0]]) > 0 else {
            'R': 'L', 'L': 'R', 'A': 'P', 'P': 'A', 'S': 'I', 'I': 'S'
        }[best[0]]
    
    row_label = closest_axis(row_dir)
    col_label = closest_axis(col_dir)
    slice_label = closest_axis(normal)
    
    orientation_label = f"{row_label}{col_label}{slice_label}"
    
    return {
        'iop': [float(x) for x in iop],
        'ipp': [float(x) for x in ipp],
        'row_direction': row_label,
        'column_direction': col_label,
        'slice_direction': slice_label,
        'orientation_label': orientation_label,
        'patient_position': patient_position,
        'row_cosine': row_dir.tolist(),
        'col_cosine': col_dir.tolist(),
        'normal': normal.tolist(),
    }

def determine_plane_orientation(dicom_path: str) -> str:
    """
    Determine if scan is axial, sagittal, coronal, or oblique.
    """
    ds = dcmread(dicom_path, stop_before_pixels=True, force=True)
    iop = ds.get('ImageOrientationPatient', [1, 0, 0, 0, 1, 0])
    
    row_dir = np.array([abs(float(iop[0])), abs(float(iop[1])), abs(float(iop[2]))])
    col_dir = np.array([abs(float(iop[3])), abs(float(iop[4])), abs(float(iop[5]))])
    
    # Determine dominant directions
    def dominant_axis(vec):
        axes = ['R-L', 'A-P', 'S-I']
        return axes[np.argmax(vec)]
    
    row_axis = dominant_axis(row_dir)
    col_axis = dominant_axis(col_dir)
    
    plane_map = {
        ('R-L', 'A-P'): 'Axial',
        ('A-P', 'R-L'): 'Axial',
        ('R-L', 'S-I'): 'Coronal',
        ('S-I', 'R-L'): 'Coronal',
        ('A-P', 'S-I'): 'Sagittal',
        ('S-I', 'A-P'): 'Sagittal',
    }
    
    plane = plane_map.get((row_axis, col_axis), 'Oblique')
    
    # Check for oblique (significant off-axis components)
    threshold = 0.5
    if (max(row_dir) < threshold) or (max(col_dir) < threshold):
        plane = 'Oblique'
    
    return plane

def reorient_to_ras(volume: np.ndarray, affine: np.ndarray) -> tuple:
    """
    Reorient a volume to RAS+ (Right-Anterior-Superior) orientation.
    This is the standard orientation for neuroimaging.
    
    Returns:
    --------
    reoriented_volume, reoriented_affine
    """
    img = nib.Nifti1Image(volume, affine)
    ras_img = nib.as_closest_canonical(img)
    return ras_img.get_fdata(), ras_img.affine
```

---

### 4.5 Phantom QA

```python
"""
MRI Phantom Quality Assurance
-------------------------------
Purpose: Automated quality assurance metrics for MRI phantoms,
         including geometric accuracy, signal uniformity,
         contrast-to-noise ratio, and slice profile analysis.
"""

import SimpleITK as sitk
import numpy as np
from scipy import ndimage
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt
from dataclasses import dataclass
from typing import Tuple, List

# ============================================================
# PHANTOM QA DATA STRUCTURES
# ============================================================

@dataclass
class PhantomQAResult:
    """Container for phantom QA metrics."""
    phantom_type: str
    geometric_accuracy_mm: float = None
    signal_uniformity_percent: float = None
    cnr: float = None
    snr: float = None
    slice_thickness_mm: float = None
    ghosting_percent: float = None
    passed: bool = False
    details: dict = None

# ============================================================
# GEOMETRIC ACCURACY (AAPM/ACR Phantom)
# ============================================================

def measure_geometric_accuracy(
    phantom_image: sitk.Image,
    expected_diameter_mm: float = 190.0,  # ACR phantom diameter
    num_profile_angles: int = 8
) -> dict:
    """
    Measure geometric accuracy by analyzing phantom diameter
    at multiple angles. Reports max deviation from expected.
    
    Parameters:
    -----------
    phantom_image : sitk.Image
        Phantom MR image
    expected_diameter_mm : float
        Known phantom diameter in mm
    num_profile_angles : int
        Number of angular profiles to measure
    
    Returns:
    --------
    dict with geometric accuracy metrics
    """
    arr = sitk.GetArrayFromImage(phantom_image)
    spacing = phantom_image.GetSpacing()
    
    # Find center slice (usually middle of volume)
    center_slice = arr.shape[0] // 2
    slice_2d = arr[center_slice, :, :]
    
    center_y, center_x = np.array(slice_2d.shape) // 2
    radius_pixels = int(expected_diameter_mm / (2 * spacing[0]))
    
    diameters = []
    angles = np.linspace(0, np.pi, num_profile_angles, endpoint=False)
    
    for angle in angles:
        # Extract profile along angle
        profile_length = int(radius_pixels * 2.5)
        y_coords = center_y + np.arange(-profile_length, profile_length) * np.sin(angle)
        x_coords = center_x + np.arange(-profile_length, profile_length) * np.cos(angle)
        
        # Interpolate profile
        profile = ndimage.map_coordinates(
            slice_2d, 
            [y_coords, x_coords],
            order=1
        )
        
        # Find edges (50% of max intensity)
        threshold = (profile.max() + profile.min()) / 2
        above_threshold = profile > threshold
        
        if above_threshold.any():
            edges = np.where(np.diff(above_threshold.astype(int)) != 0)[0]
            if len(edges) >= 2:
                diameter_px = edges[-1] - edges[0]
                diameter_mm = diameter_px * spacing[0]
                diameters.append(diameter_mm)
    
    if diameters:
        mean_diameter = np.mean(diameters)
        max_error = max(abs(d - expected_diameter_mm) for d in diameters)
        
        return {
            'mean_diameter_mm': mean_diameter,
            'expected_diameter_mm': expected_diameter_mm,
            'max_error_mm': max_error,
            'all_diameters_mm': diameters,
            'passed': max_error < 2.0  # 2mm tolerance (ACR standard)
        }
    
    return {'error': 'Could not measure diameter'}

# ============================================================
# SIGNAL UNIFORMITY
# ============================================================

def measure_signal_uniformity(
    phantom_image: sitk.Image,
    roi_radius_percent: float = 80.0
) -> dict:
    """
    Measure signal uniformity using the ACR method.
    Uniformity = (S_max - S_min) / (S_max + S_min) * 100%
    
    Parameters:
    -----------
    phantom_image : sitk.Image
        Uniform phantom image (typically T1 SE)
    roi_radius_percent : float
        Radius of ROI as percentage of phantom radius
    
    Returns:
    --------
    dict with uniformity metrics
    """
    arr = sitk.GetArrayFromImage(phantom_image)
    center_slice = arr.shape[0] // 2
    slice_2d = arr[center_slice, :, :]
    
    # Create circular ROI mask
    h, w = slice_2d.shape
    y, x = np.ogrid[:h, :w]
    center_y, center_x = h // 2, w // 2
    radius = min(center_y, center_x) * (roi_radius_percent / 100.0)
    
    mask = ((x - center_x)**2 + (y - center_y)**2) <= radius**2
    roi_values = slice_2d[mask]
    
    s_max = float(np.percentile(roi_values, 99))
    s_min = float(np.percentile(roi_values, 1))
    s_mean = float(np.mean(roi_values))
    s_std = float(np.std(roi_values))
    
    # ACR percent integral uniformity
    piu = ((s_max - s_min) / (s_max + s_min)) * 100.0
    
    # Percent standard deviation
    psd = (s_std / s_mean) * 100.0
    
    return {
        'percent_integral_uniformity': piu,
        'percent_standard_deviation': psd,
        'mean_signal': s_mean,
        'signal_std': s_std,
        'signal_max': s_max,
        'signal_min': s_min,
        'passed': piu < 10.0  # <10% for ACR large phantom
    }

# ============================================================
# CONTRAST-TO-NOISE RATIO (CNR)
# ============================================================

def measure_cnr(
    image: sitk.Image,
    roi1_center: tuple,  # (x, y, z) in mm
    roi2_center: tuple,
    roi_radius_mm: float = 5.0,
    background_center: tuple = None
) -> dict:
    """
    Measure Contrast-to-Noise Ratio between two ROIs.
    CNR = |S1 - S2| / sigma_background
    """
    arr = sitk.GetArrayFromImage(image)
    spacing = image.GetSpacing()
    
    def mm_to_voxel(coords_mm):
        """Convert mm coordinates to voxel indices."""
        origin = image.GetOrigin()
        return tuple(
            int(round((coords_mm[i] - origin[i]) / spacing[i]))
            for i in range(3)
        )
    
    def extract_roi(center_mm, radius_mm):
        """Extract spherical ROI values."""
        cx, cy, cz = mm_to_voxel(center_mm)
        radius_vox = int(radius_mm / min(spacing))
        
        z_range = slice(max(0, cz - radius_vox), min(arr.shape[0], cz + radius_vox + 1))
        y_range = slice(max(0, cy - radius_vox), min(arr.shape[1], cy + radius_vox + 1))
        x_range = slice(max(0, cx - radius_vox), min(arr.shape[2], cx + radius_vox + 1))
        
        roi = arr[z_range, y_range, x_range]
        
        # Spherical mask
        zz, yy, xx = np.ogrid[
            z_range.start - cz : z_range.stop - cz,
            y_range.start - cy : y_range.stop - cy,
            x_range.start - cx : x_range.stop - cx
        ]
        sphere_mask = (zz**2 + yy**2 + xx**2) <= radius_vox**2
        
        return roi[sphere_mask]
    
    # Extract ROIs
    roi1_vals = extract_roi(roi1_center, roi_radius_mm)
    roi2_vals = extract_roi(roi2_center, roi_radius_mm)
    
    # Background ROI (if not provided, use corner)
    if background_center:
        bg_vals = extract_roi(background_center, roi_radius_mm * 2)
    else:
        # Use image corner
        corner = arr[:20, :20, :20]
        bg_vals = corner[corner > 0] if corner.any() else arr.flatten()[:1000]
    
    s1 = np.mean(roi1_vals)
    s2 = np.mean(roi2_vals)
    sigma_bg = np.std(bg_vals)
    
    cnr = abs(s1 - s2) / (sigma_bg + 1e-10)
    
    return {
        'cnr': float(cnr),
        'roi1_mean': float(s1),
        'roi2_mean': float(s2),
        'background_std': float(sigma_bg),
        'roi1_std': float(np.std(roi1_vals)),
        'roi2_std': float(np.std(roi2_vals)),
    }

# ============================================================
# SNR (SIGNAL-TO-NOISE RATIO)
# ============================================================

def measure_snr(
    phantom_image: sitk.Image,
    method: str = 'subtraction'  # 'subtraction' or 'single'
) -> dict:
    """
    Measure SNR using the subtraction method (two acquisitions)
    or single-image method.
    
    Subtraction method (GE protocol):
    SNR = S_mean / (SD_subtraction / sqrt(2))
    
    Single-image method:
    SNR = S_mean / SD_background
    """
    arr = sitk.GetArrayFromImage(phantom_image)
    
    # Use center slice
    center_slice = arr.shape[0] // 2
    slice_2d = arr[center_slice, :, :]
    
    if method == 'single':
        # Background from corner
        bg = slice_2d[:20, :20].flatten()
        signal_region = slice_2d[
            slice_2d.shape[0]//4:3*slice_2d.shape[0]//4,
            slice_2d.shape[1]//4:3*slice_2d.shape[1]//4
        ]
        
        s_mean = np.mean(signal_region)
        noise_std = np.std(bg)
        snr = s_mean / (noise_std + 1e-10)
        
    else:  # subtraction method (requires two images)
        snr = None  # Requires two repeated acquisitions
        s_mean = np.mean(slice_2d)
        noise_std = None
    
    return {
        'snr': float(snr) if snr else None,
        'signal_mean': float(s_mean),
        'noise_std': float(noise_std) if noise_std else None,
        'method': method
    }

# ============================================================
# SLICE PROFILE / THICKNESS
# ============================================================

def measure_slice_thickness(
    phantom_image: sitk.Image,
    wedge_angle_degrees: float = 10.0  # ACR phantom wedge angle
) -> dict:
    """
    Estimate slice thickness from ramp phantom.
    Uses the relationship: thickness = ramp_length * tan(wedge_angle)
    """
    arr = sitk.GetArrayFromImage(phantom_image)
    spacing = phantom_image.GetSpacing()
    
    # Find slice with ramp phantom features
    # This is a simplified implementation
    center_slice_idx = arr.shape[0] // 2
    
    # Extract profiles perpendicular to slice direction
    profile = arr[:, arr.shape[1]//2, arr.shape[2]//2]
    
    # Find edges (transition regions)
    gradient = np.abs(np.gradient(profile))
    edge_indices = np.where(gradient > np.max(gradient) * 0.5)[0]
    
    if len(edge_indices) >= 2:
        # FWHM of transition region
        fwhm_pixels = edge_indices[-1] - edge_indices[0]
        fwhm_mm = fwhm_pixels * spacing[2]
        
        return {
            'fwhm_mm': float(fwhm_mm),
            'nominal_thickness_mm': float(spacing[2]),
            'deviation_percent': float(abs(fwhm_mm - spacing[2]) / spacing[2] * 100),
            'passed': abs(fwhm_mm - spacing[2]) / spacing[2] < 0.2  # 20% tolerance
        }
    
    return {'error': 'Could not measure slice thickness'}

# ============================================================
# COMPLETE PHANTOM QA PIPELINE
# ============================================================

def run_phantom_qa(
    phantom_image_path: str,
    phantom_type: str = 'ACR_LARGE'
) -> PhantomQAResult:
    """
    Run complete phantom QA pipeline.
    
    Parameters:
    -----------
    phantom_image_path : str
        Path to phantom MRI NIfTI or DICOM
    phantom_type : str
        'ACR_LARGE', 'ACR_SMALL', 'EUROSPIN', or 'CUSTOM'
    
    Returns:
    --------
    PhantomQAResult with all metrics
    """
    img = sitk.ReadImage(phantom_image_path)
    
    # Expected phantom dimensions by type
    phantom_specs = {
        'ACR_LARGE': {'diameter_mm': 190.0, 'uniformity_threshold': 10.0},
        'ACR_SMALL': {'diameter_mm': 148.0, 'uniformity_threshold': 15.0},
    }
    spec = phantom_specs.get(phantom_type, phantom_specs['ACR_LARGE'])
    
    # Run all QA tests
    geo = measure_geometric_accuracy(img, spec['diameter_mm'])
    uniformity = measure_signal_uniformity(img)
    snr = measure_snr(img)
    thickness = measure_slice_thickness(img)
    
    # Aggregate results
    all_passed = all([
        geo.get('passed', False),
        uniformity.get('passed', False),
        thickness.get('passed', True),
    ])
    
    result = PhantomQAResult(
        phantom_type=phantom_type,
        geometric_accuracy_mm=geo.get('max_error_mm'),
        signal_uniformity_percent=uniformity.get('percent_integral_uniformity'),
        snr=snr.get('snr'),
        slice_thickness_mm=thickness.get('fwhm_mm'),
        passed=all_passed,
        details={
            'geometric': geo,
            'uniformity': uniformity,
            'snr': snr,
            'slice_thickness': thickness
        }
    )
    
    return result
```

---

## 5. Integration Patterns

### Pattern A: DICOM-to-NIfTI Pipeline

```python
"""
Complete DICOM to NIfTI Conversion Pipeline
=============================================
Clinical workflow for converting raw DICOM to analysis-ready NIfTI.
"""

def dicom_to_nifti_pipeline(
    dicom_root: str,
    output_bids_dir: str,
    subject_id: str,
    session_id: str = None,
    deidentify: bool = True,
    validate: bool = True
):
    """
    Complete pipeline: DICOM -> Organize -> Validate -> De-identify -> NIfTI
    """
    import pydicom
    from pydicom import dcmread
    import nibabel as nib
    import json
    from pathlib import Path
    import shutil
    
    output_root = Path(output_bids_dir)
    
    # Step 1: Organize DICOM by series
    series = organize_dicom_series(dicom_root)
    
    for series_uid, info in series.items():
        # Step 2: Validate series completeness
        validation = validate_series_completeness(info)
        if not validation['is_complete']:
            print(f"WARNING: Series {info['series_description']} incomplete")
            continue
        
        # Step 3: Identify sequence type
        sample_file = info['files'][0]
        ds = dcmread(sample_file, stop_before_pixels=True)
        seq_type = identify_mri_sequence(
            info['series_description'],
            float(ds.get('RepetitionTime', 0)),
            float(ds.get('EchoTime', 0)),
            float(ds.get('InversionTime', 0)) if 'InversionTime' in ds else None,
            float(ds.get('FlipAngle', 0))
        )
        
        # Step 4: Determine BIDS filename
        bids_entities = {
            'sub': subject_id,
            'ses': session_id,
            'acq': info['series_description'].replace(' ', '').replace('_', '')[:20],
            'run': '01',
            'suffix': seq_type
        }
        
        # Step 5: Build 3D volume
        volume = build_3d_volume(info['files'], sort_by_position=True)
        
        # Step 6: Build affine from DICOM geometry
        ds_first = dcmread(info['files'][0])
        ds_last = dcmread(info['files'][-1])
        affine = build_affine_from_dicom(ds_first, ds_last)
        
        # Step 7: Create NIfTI
        nii = nib.Nifti1Image(volume, affine)
        nii = nib.as_closest_canonical(nii)  # Reorient to RAS+
        
        # Step 8: Save
        out_dir = output_root / f"sub-{subject_id}"
        if session_id:
            out_dir = out_dir / f"ses-{session_id}"
        out_dir = out_dir / 'anat' if seq_type in ['T1w', 'T2w', 'FLAIR', 'PD'] else out_dir / 'func'
        out_dir.mkdir(parents=True, exist_ok=True)
        
        fname = out_dir / f"sub-{subject_id}_{seq_type}.nii.gz"
        nib.save(nii, str(fname))
        
        # Step 9: Save metadata JSON sidecar
        meta = extract_mri_metadata(ds_first)
        meta['SeriesDescription'] = info['series_description']
        meta['SequenceType'] = seq_type
        if deidentify:
            # Remove PHI from metadata
            for key in ['PatientID', 'PatientName', 'PatientBirthDate']:
                meta.pop(key, None)
        
        json_path = fname.with_suffix('').with_suffix('.json')
        with open(json_path, 'w') as f:
            json.dump(meta, f, indent=2, default=str)

def build_affine_from_dicom(first_slice: pydicom.Dataset, 
                            last_slice: pydicom.Dataset = None) -> np.ndarray:
    """Build NIfTI affine matrix from DICOM geometry tags."""
    iop = first_slice.ImageOrientationPatient
    ipp = first_slice.ImagePositionPatient
    ps = first_slice.PixelSpacing
    st = first_slice.SliceThickness
    
    row_cos = np.array([float(iop[0]), float(iop[1]), float(iop[2])])
    col_cos = np.array([float(iop[3]), float(iop[4]), float(iop[5])])
    normal = np.cross(row_cos, col_cos)
    
    affine = np.eye(4)
    affine[:3, 0] = row_cos * float(ps[0])
    affine[:3, 1] = col_cos * float(ps[1])
    affine[:3, 2] = normal * float(st)
    affine[:3, 3] = [float(ipp[0]), float(ipp[1]), float(ipp[2])]
    
    return affine
```

### Pattern B: Cloud DICOM -> NIfTI Pipeline

```python
"""
Cloud DICOMweb to NIfTI Pipeline
==================================
Retrieve DICOM from DICOMweb, process, and save as NIfTI/BIDS.
"""

def dicomweb_to_nifti_pipeline(
    dicomweb_url: str,
    study_instance_uid: str,
    output_dir: str,
    series_filter: list = None
):
    """Download study from DICOMweb, convert to NIfTI, organize in BIDS."""
    from dicomweb_client.api import DICOMwebClient
    
    client = DICOMwebClient(dicomweb_url)
    
    # Get series in study
    series_list = client.search_for_series(study_instance_uid=study_instance_uid)
    
    for series in series_list:
        series_uid = series.SeriesInstanceUID
        series_desc = series.get('SeriesDescription', '')
        modality = series.get('Modality', '')
        
        # Filter by modality if specified
        if series_filter and series_desc not in series_filter:
            continue
        if modality != 'MR':
            continue
        
        # Download series
        datasets = client.retrieve_series(
            study_instance_uid=study_instance_uid,
            series_instance_uid=series_uid
        )
        
        # Convert to NIfTI (using nibabel dicomreaders or manual stacking)
        # ... (as shown in Pattern A)
```

---

## 6. Pipeline Quick Reference

### Common One-Liners

```bash
# pydicom: Read DICOM header
python -c "import pydicom; print(pydicom.dcmread('file.dcm').SeriesDescription)"

# NiBabel: Check NIfTI orientation
python -c "import nibabel as nib; img = nib.load('brain.nii.gz'); print(nib.aff2axcodes(img.affine))"

# SimpleITK: Convert DICOM series to NIfTI
python -c "import SimpleITK as sitk; r = sitk.ImageSeriesReader(); r.SetFileNames(r.GetGDCMSeriesFileNames('.')); sitk.WriteImage(r.Execute(), 'output.nii.gz')"

# dicognito: De-identify directory
python -m dicognito anonymize --output-dir ./anonymized/ ./input/

# templateflow: Download MNI template
python -c "from templateflow import api as tf; print(tf.get('MNI152NLin2009cAsym', suffix='T1w', resolution=1, extension='nii.gz'))"

# pyBIDS: List all T1w files
python -c "from bids import BIDSLayout; l = BIDSLayout('.'); print([f.path for f in l.get(suffix='T1w')])"
```

### Environment Setup

```bash
# Create clinical MRI processing environment
conda create -n mri-processing python=3.10 -y
conda activate mri-processing

# Install complete stack
pip install pydicom SimpleITK nibabel nilearn nitransforms templateflow pybids
pip install dicognito dicomweb-client highdicom orthanc
pip install numpy scipy pandas matplotlib scikit-learn jupyter

# Verify installations
python -c "import pydicom; print(f'pydicom: {pydicom.__version__}')"
python -c "import SimpleITK as sitk; print(f'SimpleITK: {sitk.Version_VersionString()}')"
python -c "import nibabel; print(f'nibabel: {nibabel.__version__}')"
python -c "import nilearn; print(f'nilearn: {nilearn.__version__}')"
python -c "import nitransforms; print(f'nitransforms: {nitransforms.__version__}')"
python -c "import templateflow; print(f'templateflow: {templateflow.__version__}')"
python -c "import bids; print(f'pybids: {bids.__version__}')"
```

---

## 7. Appendix: Tool Comparison Matrix

| Tool | Domain | License | Complexity | Clinical Relevance | Format I/O | Key Strength |
|------|--------|---------|------------|-------------------|------------|-------------|
| **pydicom** | DICOM I/O | MIT | 1/5 | 5/5 | DICOM read/write | Universal DICOM access |
| **SimpleITK** | Image Processing | Apache 2.0 | 2/5 | 5/5 | DICOM, NIfTI, NRRD, MHD | Registration, filtering, segmentation |
| **NiBabel** | NIfTI I/O | MIT | 1/5 | 5/5 | NIfTI, ANALYZE, CIFTI, PAR/REC | Neuroimaging format standard |
| **dicognito** | De-identification | MIT | 2/5 | 5/5 | DICOM in/out | HIPAA-compliant PHI removal |
| **dicomweb-client** | DICOMweb | MIT | 3/5 | 4/5 | DICOMweb REST | Cloud PACS integration |
| **orthanc-python** | DICOM Server | GPL-3.0 | 4/5 | 4/5 | DICOM via REST | Server-side automation |
| **highdicom** | DICOM SR/Seg | MIT | 4/5 | 4/5 | DICOM SR, Seg, Parametric Map | Standards-compliant derived objects |
| **nilearn** | Analysis/ML | BSD-3 | 2/5 | 5/5 | NIfTI | Machine learning on neuroimages |
| **nitransforms** | Transforms | Apache 2.0 | 3/5 | 4/5 | ITK, FSL, AFNI, FreeSurfer | Cross-tool transform interoperability |
| **templateflow** | Templates | Apache 2.0 | 2/5 | 4/5 | NIfTI, GIFTI | Standardized template archive |
| **pyBIDS** | BIDS | MIT | 2/5 | 4/5 | BIDS dataset queries | Dataset organization & querying |

### Stack Selection Guide

| Clinical Task | Recommended Stack |
|--------------|-------------------|
| DICOM to NIfTI conversion | pydicom + SimpleITK + NiBabel |
| Brain extraction + registration | SimpleITK + templateflow + nilearn |
| PHI de-identification | dicognito + pydicom (audit) |
| Cloud PACS integration | dicomweb-client + pydicom |
| AI results to DICOM | highdicom + pydicom |
| fMRI preprocessing | nilearn + NiBabel + nitransforms |
| Multi-site study organization | pyBIDS + templateflow + dicognito |
| Phantom QA | SimpleITK + custom metrics |
| Server-side DICOM routing | orthanc-python |

### Version Compatibility Matrix (2025)

| Package | Recommended Version | Python | Dependencies |
|---------|-------------------|--------|-------------|
| pydicom | 3.0+ | 3.9-3.12 | None |
| SimpleITK | 2.4+ | 3.9-3.12 | None |
| nibabel | 5.2+ | 3.9-3.12 | numpy |
| dicognito | 1.1+ | 3.9-3.12 | pydicom |
| dicomweb-client | 0.60+ | 3.9-3.12 | pydicom, requests |
| highdicom | 0.24+ | 3.9-3.12 | pydicom, numpy |
| nilearn | 0.11+ | 3.9-3.12 | nibabel, sklearn |
| nitransforms | 24.1+ | 3.9-3.12 | nibabel, scipy |
| templateflow | 24.2+ | 3.9-3.12 | pybids, requests |
| pybids | 0.18+ | 3.9-3.12 | bids-validator |

---

> **Document End.** This guide is a living document. Update package versions and add new tools as the ecosystem evolves. Always verify installation commands against official documentation for the latest versions.
