import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
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

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  let response;
  if (Platform.OS === 'web') {
    const form = new FormData();
    const file = await fetch(asset.uri).then((response) => response.blob());
    form.append('file', file, asset.fileName || 'product-image.jpg');
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    response = await fetch(uploadUrl, { method: 'POST', body: form });
  } else {
    const result = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: asset.mimeType || 'image/jpeg',
      parameters: { upload_preset: CLOUDINARY_UPLOAD_PRESET },
    });
    response = {
      ok: result.status >= 200 && result.status < 300,
      json: async () => JSON.parse(result.body),
    };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Cloudinary returned an invalid response while uploading the image.');
  }
  if (!response.ok || !payload.secure_url) {
    throw new Error(payload.error?.message || 'Image upload failed. Check the Cloudinary cloud name and unsigned preset.');
  }
  return payload.secure_url;
}
