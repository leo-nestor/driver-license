import os
import re
import xml.etree.ElementTree as ET

def modify_bndbox_content(bndbox_content):
    """Modifies the content of xmin, ymin, xmax, ymax tags and reorders them."""
    # Replace xmin, ymin, xmax, ymax tags with the new order
    pattern = r'<(xmin|ymin|xmax|ymax)>(\d+)</\1>'
    def replace_values(match):
        tag = match.group(1)
        value = int(match.group(2))
        # Change the value to 639 if it is >= 640
        if value >= 640:
            value = 639
        return f'<{tag}>{value}</{tag}>'
    modified_content = re.sub(pattern, replace_values, bndbox_content)
    # Reorder the tags
    order = ['xmin', 'ymin', 'xmax', 'ymax']
    reordered_content = []
    for tag in order:
        match = re.search(f'<{tag}>\d+</{tag}>', modified_content)
        if match:
            reordered_content.append(match.group(0))
    # Create the final bndbox content with reordered tags
    return f'<bndbox>\n\t' + '\n\t'.join(reordered_content) + '\n</bndbox>'

def remove_occluded(content):
    """Removes the <occluded> tag without altering indentation."""
    return re.sub(r'\s*<occluded>\d+</occluded>\s*', '\n', content)

def remove_xml_declaration(directory):
    """Removes the XML declaration '<?xml version='1.0' encoding='UTF-8'?>' from all .xml files in the directory."""
    for filename in os.listdir(directory):
        if filename.endswith('.xml'):
            xml_path = os.path.join(directory, filename)
            
            # Read the content of the file
            with open(xml_path, 'r', encoding='UTF-8') as file:
                lines = file.readlines()
            
            # Filter lines to remove the XML declaration
            with open(xml_path, 'w', encoding='UTF-8') as file:
                for line in lines:
                    # Skip the line if it contains the XML declaration
                    if not line.strip().startswith('<?xml'):
                        file.write(line)
            
            print(f'XML declaration removed in: {filename}')

def update_database_tag(directory):
    """Updates the content of the <database> tag in <source> to 'Unknown' in all .xml files."""
    for filename in os.listdir(directory):
        if filename.endswith('.xml'):
            xml_path = os.path.join(directory, filename)
            
            # Parse the XML file
            tree = ET.parse(xml_path)
            root = tree.getroot()
            
            # Find the <database> tag within <source>
            source = root.find('source')
            if source is not None:
                database_tag = source.find('database')
                if database_tag is not None:
                    database_tag.text = "Unknown"
                    print(f'Updated <database> in {filename} to "Unknown"')
            
            # Save changes to the XML file
            tree.write(xml_path, encoding='UTF-8', xml_declaration=True)

def process_xml_file(file_path):
    """Processes an XML file to modify, reorder bndbox tags, and remove occluded."""
    try:
        with open(file_path, 'r', encoding='UTF-8') as file:
            lines = file.readlines()
        # Process each line and construct the new content
        new_lines = []
        skip_bndbox = False
        bndbox_lines = []
        for line in lines:
            # Remove <occluded>
            if '<occluded>' in line:
                continue
            # If we find a bndbox, modify it
            if '<bndbox>' in line:
                skip_bndbox = True
                bndbox_lines = [line]  # Start the bndbox block
                continue
            if skip_bndbox:
                bndbox_lines.append(line)
                if '</bndbox>' in line:  # End the bndbox block
                    modified_bndbox = modify_bndbox_content(''.join(bndbox_lines))
                    new_lines.append(modified_bndbox)
                    skip_bndbox = False
                continue
            new_lines.append(line)
        # Save the modified XML file
        with open(file_path, 'w', encoding='UTF-8') as file:
            file.writelines(new_lines)
        print(f'File processed: {file_path}')
    except Exception as e:
        print(f'Error processing {file_path}: {e}')

def process_xml_files(directory):
    """Traverses all XML files in the current directory and processes them."""
    # Remove XML declarations from all files first
    remove_xml_declaration(directory)
    # Update <database> tags in all files
    update_database_tag(directory)
    # Then process each file for bndbox and occluded modifications
    for filename in os.listdir(directory):
        if filename.endswith('.xml'):
            file_path = os.path.join(directory, filename)
            process_xml_file(file_path)

if __name__ == '__main__':
    # Get the current directory
    current_directory = os.getcwd()
    process_xml_files(current_directory)
