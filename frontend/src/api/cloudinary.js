import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../config/cloudinary';

export async function chooseAndUploadProductImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Allow photo library access to add a product image.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.85,
  });
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset?.uri) throw new Error('The selected image could not be read.');

  const form = new FormData();
  if (Platform.OS === 'web') {
    const file = await fetch(asset.uri).then((response) => response.blob());
    form.append('file', file, asset.fileName || 'product-image.jpg');
  } else {
    form.append('file', {
      uri: asset.uri,
      name: asset.fileName || 'product-image.jpg',
      type: asset.mimeType || 'image/jpeg',
    });
  }
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  );
  const payload = await response.json();
  if (!response.ok || !payload.secure_url) {
    throw new Error(payload.error?.message || 'Image upload failed. Check the Cloudinary cloud name and unsigned preset.');
  }
  return payload.secure_url;
}
